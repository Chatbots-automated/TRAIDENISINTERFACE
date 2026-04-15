/**
 * Shared helpers for turning unknown runtime errors into user-friendly
 * toast/notification messages.
 */

export function formatErrorForToast(error: unknown, fallback = 'Įvyko nežinoma klaida'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error.trim() || fallback;

  if (error instanceof Error) {
    return error.message?.trim() || fallback;
  }

  if (typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }

  return fallback;
}

export function formatToastMessage(prefix: string, error: unknown, fallback = 'Įvyko klaida'): string {
  const msg = formatErrorForToast(error, fallback);
  return `${prefix}: ${msg}`;
}

