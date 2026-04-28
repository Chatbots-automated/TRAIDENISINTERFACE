exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'Invalid JSON body' });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const maxRows = clampInteger(body.max_rows, 1, 1000, 200);
  const includeRawCsv = body.include_raw_csv === true;

  try {
    const csvUrl = buildGoogleSheetCsvUrl(url, body.gid);
    const response = await fetch(csvUrl, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
        'user-agent': 'TraidenisInterface/1.0 GoogleSheetReader',
      },
    });

    if (!response.ok) {
      return jsonResponse(response.status, {
        success: false,
        error: response.status === 401 || response.status === 403
          ? 'Google Sheet is not public. Publish it or share it publicly, then try again.'
          : `Google Sheet export failed (${response.status})`,
      });
    }

    const csv = await response.text();
    const parsedRows = parseCsv(csv);
    const headers = parsedRows[0] || [];
    const rows = parsedRows.slice(1, maxRows + 1).map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        const key = String(header || `column_${index + 1}`).trim() || `column_${index + 1}`;
        item[key] = row[index] ?? '';
      });
      return item;
    });

    return jsonResponse(200, {
      success: true,
      source_url: url,
      export_url: csvUrl,
      headers,
      row_count: Math.max(parsedRows.length - 1, 0),
      returned_rows: rows.length,
      rows,
      raw_csv: includeRawCsv ? csv : undefined,
    });
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read Google Sheet',
    });
  }
};

function buildGoogleSheetCsvUrl(inputUrl, explicitGid) {
  if (!inputUrl) throw new Error('Missing Google Sheet URL');

  const parsed = new URL(inputUrl);
  if (!['docs.google.com', 'www.docs.google.com'].includes(parsed.hostname)) {
    throw new Error('Only docs.google.com spreadsheet URLs are supported');
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  const spreadsheetId = match?.[1];
  if (!spreadsheetId) throw new Error('Invalid Google Sheets URL');

  const gid = String(explicitGid || parsed.searchParams.get('gid') || '0').replace(/[^\d]/g, '') || '0';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}
