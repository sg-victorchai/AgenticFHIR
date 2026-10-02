export interface RecentPatient {
  id: string;
  name: string;
  mrn?: string;
  viewedAt: string;
}

const STORAGE_KEY = 'ai-consult-recent-patients';
const MAX_RECENT = 6;

export const getRecentPatients = (): RecentPatient[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const rememberRecentPatient = (
  patient: Omit<RecentPatient, 'viewedAt'>,
) => {
  const list = [
    { ...patient, viewedAt: new Date().toISOString() },
    ...getRecentPatients().filter((item) => item.id !== patient.id),
  ].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};
