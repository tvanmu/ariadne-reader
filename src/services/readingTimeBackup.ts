import type { PDFProject } from '../types';

const READING_TIME_BACKUP_PREFIX = 'ariadne-reader:reading-time:';

export function applyReadingTimeBackup(project: PDFProject): PDFProject {
  const backedUpSeconds = readReadingTimeBackup(project.id);

  if (backedUpSeconds === null || backedUpSeconds <= project.totalReadingSeconds) {
    clearReadingTimeBackup(project.id);
    return project;
  }

  return {
    ...project,
    totalReadingSeconds: backedUpSeconds,
  };
}

export function saveReadingTimeBackup(projectId: string, totalReadingSeconds: number): void {
  try {
    window.localStorage.setItem(
      getReadingTimeBackupKey(projectId),
      String(getSafeReadingSeconds(totalReadingSeconds)),
    );
  } catch {
    // Best-effort rescue for tab close; the database remains the source of truth.
  }
}

export function clearReadingTimeBackup(projectId: string): void {
  try {
    window.localStorage.removeItem(getReadingTimeBackupKey(projectId));
  } catch {
    // Ignore storage access failures.
  }
}

function readReadingTimeBackup(projectId: string): number | null {
  try {
    const rawValue = window.localStorage.getItem(getReadingTimeBackupKey(projectId));

    if (!rawValue) {
      return null;
    }

    const seconds = Number(rawValue);

    return Number.isFinite(seconds) ? getSafeReadingSeconds(seconds) : null;
  } catch {
    return null;
  }
}

function getReadingTimeBackupKey(projectId: string): string {
  return `${READING_TIME_BACKUP_PREFIX}${projectId}`;
}

function getSafeReadingSeconds(seconds: number): number {
  return Math.max(Math.floor(seconds), 0);
}
