interface DirectusAssetUrlOptions {
  cacheKey?: string | number;
  download?: boolean;
}

function buildSameOriginUrl(path: string): URL {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  return new URL(path, origin);
}

export function buildDirectusAssetUrl(fileId: string, options: DirectusAssetUrlOptions = {}): string {
  const url = buildSameOriginUrl(`/api/directus-assets/${encodeURIComponent(fileId)}`);
  if (options.cacheKey !== undefined) {
    url.searchParams.set('_preview', String(options.cacheKey));
  }
  if (options.download) {
    url.searchParams.set('download', '');
  }
  return typeof window !== 'undefined' ? url.toString() : `${url.pathname}${url.search}`;
}

export function buildDirectusDownloadUrl(fileId: string): string {
  return buildDirectusAssetUrl(fileId, { download: true });
}

export function buildGoogleDocsViewerUrl(fileUrl: string): string {
  const url = new URL('https://docs.google.com/gview');
  url.searchParams.set('url', fileUrl);
  url.searchParams.set('embedded', 'true');
  return url.toString();
}
