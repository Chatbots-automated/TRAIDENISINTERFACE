type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^######\s+(.+)$/gm, '<h6 class="text-xs font-semibold mt-4 mb-1" style="color:#3d3935">$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5 class="text-sm font-semibold mt-4 mb-1" style="color:#3d3935">$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4 class="text-sm font-bold mt-5 mb-2" style="color:#3d3935">$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-2" style="color:#3d3935">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2" style="color:#3d3935">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3" style="color:#3d3935">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre class="rounded-lg p-3 my-3 text-xs overflow-x-auto" style="background:#f5f3f0;border:0.5px solid rgba(0,0,0,0.08)"><code>${code}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded text-xs" style="background:rgba(0,0,0,0.05)">$1</code>')
    .replace(/^---$/gm, '<hr class="my-4" style="border-color:rgba(0,0,0,0.08)" />')
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm" style="color:#3d3935">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-sm" style="color:#3d3935">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-500 underline">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-2" />')
    .replace(/^&gt;\s+(.+)$/gm, '<blockquote class="border-l-3 pl-3 my-2 italic" style="border-color:#007AFF;color:#5a5550">$1</blockquote>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s\-:]+$/.test(c))) {
        return '<!-- table separator -->';
      }
      const tds = cells.map(c => `<td class="px-3 py-2 text-sm" style="border:0.5px solid rgba(0,0,0,0.1)">${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .replace(/\n\n/g, '</p><p class="text-sm my-2" style="color:#3d3935">')
    .replace(/\n/g, '<br/>');

  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(?:\s*(?:&lt;!-- table separator --&gt;)\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table class="w-full my-3 rounded-lg overflow-hidden" style="border:0.5px solid rgba(0,0,0,0.1)">$1</table>'
  );

  html = html.replace(/&lt;!-- table separator --&gt;/g, '');

  return `<div class="prose max-w-none"><p class="text-sm my-2" style="color:#3d3935">${html}</p></div>`;
}

function tryParseJsonArray(text: string): JsonRecord[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length > 0 && isJsonRecord(parsed[0])) {
      return parsed;
    }
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const inner = JSON.parse(codeBlockMatch[1].trim());
        if (Array.isArray(inner) && inner.length > 0) return inner;
      } catch {
        // Not valid JSON.
      }
    }
  }
  return null;
}

function renderTankCard(tank: JsonRecord, index: number): string {
  const name = tank.pavadinimas || `Talpa ${index + 1}`;
  const pos = tank.pozicija ? ` (${tank.pozicija})` : '';

  const fieldLabels: Record<string, string> = {
    Talpa_m3: 'Talpa', Skersmuo_mm: 'Skersmuo', Aukštis_mm: 'Aukštis',
    Orientacija: 'Orientacija', Dugno_tipas: 'Dugno tipas', Medžiaga: 'Medžiaga',
    Vieta: 'Vieta', Cheminė_aplinka_Terpė: 'Terpė', Cheminė_aplinka_Koncentracija: 'Koncentracija',
    Cheminė_aplinka_Tankis_kg_m3: 'Tankis', 'Cheminė_aplinka_Temperatūra_°C': 'Temperatūra',
    Cheminė_aplinka_Slėgis_bar_g: 'Slėgis', Apšiltinimas: 'Apšiltinimas',
    Elektrinis_šildymas: 'El. šildymas', Maišyklė: 'Maišyklė',
    Maišyklė_aprašymas: 'Maišymo aprašymas', Jungtys: 'Jungtys', Pastabos: 'Pastabos',
    projekto_kontekstas_Klientas: 'Klientas', projekto_kontekstas_Užsakovas: 'Užsakovas',
  };

  const units: Record<string, string> = {
    Talpa_m3: ' m³', Skersmuo_mm: ' mm', Aukštis_mm: ' mm',
    Cheminė_aplinka_Tankis_kg_m3: ' kg/m³', 'Cheminė_aplinka_Temperatūra_°C': ' °C',
    Cheminė_aplinka_Slėgis_bar_g: ' bar(g)',
  };

  const skipKeys = new Set(['pavadinimas', 'pozicija', 'eilės_nr']);
  const rows = Object.entries(tank)
    .filter(([k, v]) => !skipKeys.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const label = fieldLabels[k] || k.replace(/_/g, ' ');
      const unit = units[k] || '';
      return `<tr><td style="padding:3px 8px;font-weight:500;color:#5a5550;white-space:nowrap;font-size:11px">${label}</td><td style="padding:3px 8px;color:#3d3935;font-size:11px">${String(v)}${unit}</td></tr>`;
    })
    .join('');

  return `<div style="margin-bottom:10px;border:0.5px solid rgba(0,0,0,0.1);border-radius:8px;overflow:hidden">
    <div style="background:rgba(0,122,255,0.06);padding:6px 10px;font-size:11px;font-weight:600;color:#007AFF">${index + 1}. ${name}${pos}</div>
    <table style="width:100%">${rows}</table>
  </div>`;
}

export function renderChatContent(content: string): { html: string; isJson: boolean } {
  const tanks = tryParseJsonArray(content);
  if (tanks) {
    const cards = tanks.map((t, i) => renderTankCard(t, i)).join('');
    const summary = `<div style="font-size:10px;color:#8a857f;margin-top:4px">Rasta talpų: ${tanks.length}</div>`;
    return { html: cards + summary, isJson: true };
  }
  return { html: '', isJson: false };
}
