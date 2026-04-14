const MAX_TOAST_MESSAGE_LENGTH = 140;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

export const formatToastMessage = (
  message: string,
  maxLength: number = MAX_TOAST_MESSAGE_LENGTH
): string => {
  const normalized = normalizeWhitespace(message || '');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

export const formatErrorForToast = (
  error: unknown,
  fallback: string = 'Operacija nepavyko'
): string => {
  const fallbackMsg = formatToastMessage(fallback);

  if (!error) return fallbackMsg;

  if (typeof error === 'string') {
    return formatToastMessage(error || fallbackMsg);
  }

  if (error instanceof Error) {
    return formatToastMessage(error.message || fallbackMsg);
  }

  if (typeof error === 'object') {
    const maybeMessage = (error as any)?.message || (error as any)?.error || (error as any)?.details;
    if (typeof maybeMessage === 'string') {
      return formatToastMessage(maybeMessage || fallbackMsg);
    }
  }

  return fallbackMsg;
};

