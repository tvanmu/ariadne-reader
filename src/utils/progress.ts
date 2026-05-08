import type { Chapter, ChapterValidationResult, DeadlineStatus, PDFProject } from '../types';

const dayMs = 24 * 60 * 60 * 1000;

export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(page), 1), Math.max(totalPages, 1));
}

export function calculateProgress(currentPage: number, totalPages: number): number {
  if (totalPages <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (clampPage(currentPage, totalPages) / totalPages) * 100));
}

export function getPagesRemaining(project: PDFProject): number {
  return Math.max(project.totalPages - clampPage(project.currentPage, project.totalPages), 0);
}

export function getDeadlineStatus(project: PDFProject): DeadlineStatus {
  const pagesRemaining = getPagesRemaining(project);

  if (!project.deadline) {
    return {
      hasDeadline: false,
      isPast: false,
      daysRemaining: null,
      dailyTarget: null,
      pagesRemaining,
    };
  }

  const today = startOfLocalDay(new Date());
  const deadline = startOfLocalDay(new Date(`${project.deadline}T00:00:00`));
  const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / dayMs);
  const isPast = daysRemaining < 0;

  if (isPast) {
    return {
      hasDeadline: true,
      isPast: true,
      daysRemaining,
      dailyTarget: null,
      pagesRemaining,
    };
  }

  const divisor = Math.max(daysRemaining, 1);

  return {
    hasDeadline: true,
    isPast: false,
    daysRemaining,
    dailyTarget: pagesRemaining === 0 ? 0 : Math.ceil(pagesRemaining / divisor),
    pagesRemaining,
  };
}

export function getCurrentChapter(chapters: Chapter[], currentPage: number): Chapter | null {
  return (
    chapters
      .slice()
      .sort((a, b) => a.startPage - b.startPage)
      .find((chapter) => currentPage >= chapter.startPage && currentPage <= chapter.endPage) ?? null
  );
}

export function calculateChapterProgress(chapter: Chapter | null, currentPage: number): number | null {
  if (!chapter) {
    return null;
  }

  const chapterLength = chapter.endPage - chapter.startPage + 1;
  if (chapterLength <= 0) {
    return null;
  }

  const completed = clampPage(currentPage, chapter.endPage) - chapter.startPage + 1;
  return Math.min(100, Math.max(0, (completed / chapterLength) * 100));
}

export function validateChapter(chapter: Omit<Chapter, 'id'>, totalPages: number): ChapterValidationResult {
  const title = chapter.title.trim();

  if (!title) {
    return { valid: false, message: 'Chapter title is required.' };
  }

  if (!Number.isInteger(chapter.startPage) || !Number.isInteger(chapter.endPage)) {
    return { valid: false, message: 'Chapter pages must be whole numbers.' };
  }

  if (chapter.startPage < 1 || chapter.endPage < 1) {
    return { valid: false, message: 'Chapter pages must start at page 1 or later.' };
  }

  if (chapter.startPage > chapter.endPage) {
    return { valid: false, message: 'Start page must be less than or equal to end page.' };
  }

  if (chapter.endPage > totalPages) {
    return { valid: false, message: `Chapter pages must stay within ${totalPages} pages.` };
  }

  return { valid: true, message: null };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
