export const LT_MONTHS_SHORT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru'];

export function formatLtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();

  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ką tik';
    if (diffMin < 60) return `Prieš ${diffMin} min.`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs === 1) return 'Prieš 1 valandą';
    return `Prieš ${diffHrs} val.`;
  }

  return `${LT_MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

const TEAM_STORAGE_PREFIX = 'traidenis_team_';
const SESSION_KEY = 'traidenis_sdk_session';

export function saveTeamSelection(conversationId: string, managerId: string | null, economistId: string | null): void {
  try {
    localStorage.setItem(`${TEAM_STORAGE_PREFIX}${conversationId}`, JSON.stringify({ managerId, economistId }));
  } catch {
    // Ignore localStorage write errors.
  }
}

export function loadTeamSelection(conversationId: string): { managerId: string | null; economistId: string | null } {
  try {
    const raw = localStorage.getItem(`${TEAM_STORAGE_PREFIX}${conversationId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore localStorage read errors.
  }
  return { managerId: null, economistId: null };
}

export function loadSession(): { showArtifact?: boolean; artifactTab?: 'data' | 'preview'; sidebarCollapsed?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSession(patch: Record<string, unknown>): void {
  try {
    const current = loadSession();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Ignore localStorage write errors.
  }
}

export function extractDirectusFileId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as { id?: unknown; data?: { id?: unknown } };
    if (typeof record.id === 'string' && record.id) return record.id;
    if (typeof record.data?.id === 'string' && record.data.id) {
      return record.data.id;
    }
  }
  return null;
}
