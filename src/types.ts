export interface Chapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
}

export interface PDFProject {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileHash: string | null;
  totalPages: number;
  currentPage: number;
  scrollOffset: number;
  zoom: number;
  uploadedAt: string;
  lastOpenedAt: string | null;
  deadline: string | null;
  totalReadingSeconds: number;
  chapters: Chapter[];
  blobKey: string;
}

export interface ReaderState {
  projectId: string;
  currentPage: number;
  scrollOffset: number;
  zoom: number;
  sessionStartedAt: string;
  lastSavedAt: string;
}

export interface DeadlineStatus {
  hasDeadline: boolean;
  isPast: boolean;
  daysRemaining: number | null;
  dailyTarget: number | null;
  pagesRemaining: number;
}

export interface ChapterValidationResult {
  valid: boolean;
  message: string | null;
}
