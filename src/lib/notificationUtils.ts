const MAX_TOAST_MESSAGE_LENGTH = 140;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const truncateToast = (message: string, maxLength: number = MAX_TOAST_MESSAGE_LENGTH): string => {
  const normalized = normalizeWhitespace(message || '');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

/**
 * Extracts a readable error message from unknown runtime values.
 */
export const formatErrorForToast = (error: unknown, fallback: string = 'Operacija nepavyko'): string => {
  const fallbackMsg = truncateToast(fallback);
  if (!error) return fallbackMsg;

  if (typeof error === 'string') return truncateToast(error || fallbackMsg);
  if (error instanceof Error) return truncateToast(error.message || fallbackMsg);

  if (typeof error === 'object') {
    const maybeMessage =
      (error as { message?: unknown; error?: unknown; details?: unknown }).message ||
      (error as { error?: unknown }).error ||
      (error as { details?: unknown }).details;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return truncateToast(maybeMessage);
    }
  }

  return fallbackMsg;
};

/**
 * Backward-compatible toast formatter.
 *
 * Supports:
 * 1) formatToastMessage('Raw message to trim', 120)
 * 2) formatToastMessage('Prefix', error, 'fallback')
 */
export function formatToastMessage(message: string, maxLength?: number): string;
export function formatToastMessage(prefix: string, error: unknown, fallback?: string): string;
export function formatToastMessage(
  first: string,
  second?: number | unknown,
  third?: string
): string {
  if (typeof second === 'number' || typeof second === 'undefined') {
    return truncateToast(first, second);
  }
  const msg = formatErrorForToast(second, third || 'Įvyko klaida');
  return truncateToast(`${first}: ${msg}`);
}
