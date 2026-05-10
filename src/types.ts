export interface Chapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
}

export type ZoomMode = 'manual' | 'fit-width';
export type PageTint = 'paper' | 'sepia' | 'night';
export type HighlightColor = 'thread' | 'sun' | 'olive' | 'wine';

export interface HighlightRange {
  itemIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface Highlight {
  id: string;
  projectId: string;
  pageNumber: number;
  ranges: HighlightRange[];
  excerpt: string;
  color: HighlightColor;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HighlightCreateInput = Pick<
  Highlight,
  'pageNumber' | 'ranges' | 'excerpt' | 'color' | 'note'
>;

export type HighlightUpdateInput = Partial<
  Pick<Highlight, 'pageNumber' | 'ranges' | 'excerpt' | 'color' | 'note'>
>;

export interface ReadingSession {
  id: string;
  projectId: string;
  date: string;
  seconds: number;
  pagesRead: number;
}

export interface ReadingSessionUpsertInput {
  id?: string;
  date: string;
  seconds: number;
  pagesRead: number;
}

export interface PdfOutlineItem {
  id: string;
  title: string;
  pageNumber: number | null;
  children: PdfOutlineItem[];
}

export interface SessionSummary {
  projectTitle: string;
  pagesRead: number;
  seconds: number;
  averagePace: number | null;
  currentChapterTitle: string | null;
  daysRemaining: number | null;
  dailyTarget: number | null;
  todayPagesRemaining: number | null;
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
  zoomMode: ZoomMode;
  pageTint: PageTint;
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
  zoomMode: ZoomMode;
  pageTint: PageTint;
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
