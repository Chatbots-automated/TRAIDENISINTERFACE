const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org').trim();
const DIRECTUS_TOKEN = (import.meta.env.VITE_DIRECTUS_TOKEN || '').trim();
const DIRECTUS_ADMIN_TOKEN = (import.meta.env.VITE_DIRECTUS_ADMIN_TOKEN || '').trim();
const DIRECTUS_EFFECTIVE_TOKEN = (DIRECTUS_ADMIN_TOKEN || DIRECTUS_TOKEN).trim();

interface DirectusAssetUrlOptions {
  cacheKey?: string | number;
  download?: boolean;
}

export function buildDirectusAssetUrl(fileId: string, options: DirectusAssetUrlOptions = {}): string {
  const url = new URL(`/assets/${fileId}`, DIRECTUS_URL);
  if (DIRECTUS_EFFECTIVE_TOKEN) {
    url.searchParams.set('access_token', DIRECTUS_EFFECTIVE_TOKEN);
  }
  if (options.cacheKey !== undefined) {
    url.searchParams.set('_preview', String(options.cacheKey));
  }
  if (options.download) {
    url.searchParams.set('download', '');
  }
  return url.toString();
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
