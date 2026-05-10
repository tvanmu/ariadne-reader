import type { Chapter, PDFProject } from '../types';
import {
  deleteProject as deleteCachedProject,
  getPdfBlob,
  getProject,
  getProjects,
  savePdfBlob,
  saveProject,
  updateChapters as updateCachedChapters,
  updateDeadline as updateCachedDeadline,
  updateProgress as updateCachedProgress,
  updateReadingTime as updateCachedReadingTime,
} from '../storage/indexedDb';
import { clampPage } from '../utils/progress';
import { uuid } from '../utils/uuid';
import { sanitizeStorageFileName, titleFromFileName } from './fileHash';

export const LOCAL_USER_ID = 'local-device';

export async function fetchLocalProjects(): Promise<PDFProject[]> {
  const projects = await getProjects();

  return projects.filter((project) => project.userId === LOCAL_USER_ID);
}

export async function fetchLocalProject(projectId: string): Promise<PDFProject> {
  const project = await getProject(projectId);

  if (!project || project.userId !== LOCAL_USER_ID) {
    throw new Error('This local reading project could not be found.');
  }

  return project;
}

export async function createLocalProjectFromPdf(input: {
  file: File;
  fileHash: string;
  totalPages: number;
}): Promise<PDFProject> {
  const projectId = uuid();
  const safeName = sanitizeStorageFileName(input.file.name) || `${projectId}.pdf`;
  const now = new Date().toISOString();
  const blobKey = `local/${projectId}/${safeName}`;

  const project: PDFProject = {
    id: projectId,
    userId: LOCAL_USER_ID,
    title: titleFromFileName(input.file.name),
    fileName: input.file.name,
    fileHash: input.fileHash,
    totalPages: input.totalPages,
    currentPage: 1,
    scrollOffset: 0,
    zoom: 1,
    zoomMode: 'manual',
    pageTint: 'paper',
    uploadedAt: now,
    lastOpenedAt: now,
    deadline: null,
    totalReadingSeconds: 0,
    chapters: [],
    blobKey,
  };

  await saveProject(project);
  await savePdfBlob(blobKey, input.file);

  return project;
}

export async function getLocalPdfBlob(project: PDFProject): Promise<Blob> {
  const blob = await getPdfBlob(project.blobKey);

  if (!blob) {
    throw new Error('The local PDF file is missing from this browser.');
  }

  return blob;
}

export async function deleteLocalProject(project: PDFProject): Promise<void> {
  await deleteCachedProject(project.id);
}

export async function updateLocalProgress(
  project: PDFProject,
  progress: Pick<PDFProject, 'currentPage' | 'scrollOffset' | 'zoom' | 'zoomMode' | 'pageTint'>,
): Promise<PDFProject> {
  const lastOpenedAt = new Date().toISOString();
  const nextProject = {
    ...project,
    currentPage: clampPage(progress.currentPage, project.totalPages),
    scrollOffset: Math.max(progress.scrollOffset, 0),
    zoom: Math.max(progress.zoom, 0.5),
    zoomMode: progress.zoomMode,
    pageTint: progress.pageTint,
    lastOpenedAt,
  };

  await updateCachedProgress(project.id, {
    currentPage: nextProject.currentPage,
    scrollOffset: nextProject.scrollOffset,
    zoom: nextProject.zoom,
    zoomMode: nextProject.zoomMode,
    pageTint: nextProject.pageTint,
    lastOpenedAt,
  });

  return nextProject;
}

export async function updateLocalDeadline(
  project: PDFProject,
  deadline: string | null,
): Promise<PDFProject> {
  await updateCachedDeadline(project.id, deadline);

  return {
    ...project,
    deadline,
  };
}

export async function updateLocalReadingTime(
  project: PDFProject,
  totalReadingSeconds: number,
): Promise<PDFProject> {
  const safeSeconds = Math.max(Math.floor(totalReadingSeconds), 0);
  await updateCachedReadingTime(project.id, safeSeconds);

  return {
    ...project,
    totalReadingSeconds: safeSeconds,
  };
}

export async function updateLocalChapters(
  project: PDFProject,
  chapters: Chapter[],
): Promise<PDFProject> {
  const nextChapters = chapters.slice().sort((a, b) => a.startPage - b.startPage);
  await updateCachedChapters(project.id, nextChapters);

  return {
    ...project,
    chapters: nextChapters,
  };
}
