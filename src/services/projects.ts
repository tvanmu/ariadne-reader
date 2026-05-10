import type { Chapter, PDFProject, ZoomMode } from '../types';
import { PDF_BUCKET_NAME, supabase } from '../lib/supabase';
import { clampPage } from '../utils/progress';
import { uuid } from '../utils/uuid';
import { sanitizeStorageFileName, titleFromFileName } from './fileHash';
import {
  deleteProject as deleteCachedProject,
  savePdfBlob,
  saveProject as saveCachedProject,
  updateChapters as updateCachedChapters,
  updateDeadline as updateCachedDeadline,
  updateProgress as updateCachedProgress,
  updateReadingTime as updateCachedReadingTime,
} from '../storage/indexedDb';

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  file_name: string;
  file_hash: string | null;
  total_pages: number;
  current_page: number;
  scroll_offset: number | string;
  zoom: number | string;
  zoom_mode: string | null;
  uploaded_at: string;
  last_opened_at: string | null;
  deadline: string | null;
  total_reading_seconds: number;
  storage_path: string;
};

type ChapterRow = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  start_page: number;
  end_page: number;
};

export async function fetchProjects(userId: string): Promise<PDFProject[]> {
  const { data: projectRows, error: projectError } = await supabase
    .from('pdf_projects')
    .select('*')
    .eq('user_id', userId);

  if (projectError) {
    throw projectError;
  }

  const rows = (projectRows ?? []) as ProjectRow[];
  const projectIds = rows.map((row) => row.id);
  const chapterRows = await fetchChapters(projectIds);
  const projects = rows.map((row) => mapProjectRow(row, chapterRows));

  projects.sort(
    (a, b) =>
      new Date(b.lastOpenedAt ?? b.uploadedAt).getTime() -
      new Date(a.lastOpenedAt ?? a.uploadedAt).getTime(),
  );

  await Promise.all(projects.map((project) => saveCachedProject(project)));

  return projects;
}

export async function fetchProject(projectId: string): Promise<PDFProject> {
  const { data, error } = await supabase
    .from('pdf_projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    throw error;
  }

  const chapters = await fetchChapters([projectId]);
  const project = mapProjectRow(data as ProjectRow, chapters);
  await saveCachedProject(project);

  return project;
}

export async function createProjectFromPdf(input: {
  userId: string;
  file: File;
  fileHash: string;
  totalPages: number;
}): Promise<PDFProject> {
  const projectId = uuid();
  const safeName = sanitizeStorageFileName(input.file.name) || `${projectId}.pdf`;
  const storagePath = `${input.userId}/${projectId}/${safeName}`;
  const now = new Date().toISOString();

  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET_NAME)
    .upload(storagePath, input.file, {
      contentType: input.file.type || 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const insertPayload = {
    id: projectId,
    user_id: input.userId,
    title: titleFromFileName(input.file.name),
    file_name: input.file.name,
    file_hash: input.fileHash,
    total_pages: input.totalPages,
    current_page: 1,
    scroll_offset: 0,
    zoom: 1,
    zoom_mode: 'manual',
    uploaded_at: now,
    last_opened_at: now,
    deadline: null,
    total_reading_seconds: 0,
    storage_path: storagePath,
  };

  const { data, error } = await supabase
    .from('pdf_projects')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from(PDF_BUCKET_NAME).remove([storagePath]);
    throw error;
  }

  const project = mapProjectRow(data as ProjectRow, []);
  await saveCachedProject(project);
  await savePdfBlob(project.blobKey, input.file);

  return project;
}

export async function downloadPdfBlob(project: PDFProject): Promise<Blob> {
  const { data, error } = await supabase.storage.from(PDF_BUCKET_NAME).download(project.blobKey);

  if (error) {
    throw error;
  }

  await savePdfBlob(project.blobKey, data);
  return data;
}

export async function deleteCloudProject(project: PDFProject): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(PDF_BUCKET_NAME)
    .remove([project.blobKey]);

  if (storageError) {
    throw storageError;
  }

  const { error } = await supabase.from('pdf_projects').delete().eq('id', project.id);

  if (error) {
    throw error;
  }

  await deleteCachedProject(project.id);
}

export async function updateCloudProgress(
  project: PDFProject,
  progress: Pick<PDFProject, 'currentPage' | 'scrollOffset' | 'zoom' | 'zoomMode'>,
): Promise<PDFProject> {
  const lastOpenedAt = new Date().toISOString();
  const nextProgress = {
    currentPage: clampPage(progress.currentPage, project.totalPages),
    scrollOffset: Math.max(progress.scrollOffset, 0),
    zoom: Math.max(progress.zoom, 0.5),
    zoomMode: progress.zoomMode,
    lastOpenedAt,
  };

  const { data, error } = await supabase
    .from('pdf_projects')
    .update({
      current_page: nextProgress.currentPage,
      scroll_offset: nextProgress.scrollOffset,
      zoom: nextProgress.zoom,
      zoom_mode: nextProgress.zoomMode,
      last_opened_at: lastOpenedAt,
    })
    .eq('id', project.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const updatedProject = {
    ...project,
    ...nextProgress,
    ...mapProjectRow(data as ProjectRow, project.chapters.map(chapterToRow(project))),
  };

  await updateCachedProgress(project.id, nextProgress);

  return updatedProject;
}

export async function updateCloudDeadline(
  project: PDFProject,
  deadline: string | null,
): Promise<PDFProject> {
  const { data, error } = await supabase
    .from('pdf_projects')
    .update({ deadline })
    .eq('id', project.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const updatedProject = mapProjectRow(data as ProjectRow, project.chapters.map(chapterToRow(project)));
  await updateCachedDeadline(project.id, deadline);

  return updatedProject;
}

export async function updateCloudReadingTime(
  project: PDFProject,
  totalReadingSeconds: number,
): Promise<PDFProject> {
  const safeSeconds = Math.max(Math.floor(totalReadingSeconds), 0);
  const { data, error } = await supabase
    .from('pdf_projects')
    .update({ total_reading_seconds: safeSeconds })
    .eq('id', project.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const updatedProject = mapProjectRow(data as ProjectRow, project.chapters.map(chapterToRow(project)));
  await updateCachedReadingTime(project.id, safeSeconds);

  return updatedProject;
}

export async function updateCloudChapters(
  project: PDFProject,
  chapters: Chapter[],
): Promise<PDFProject> {
  const { error: deleteError } = await supabase
    .from('chapters')
    .delete()
    .eq('project_id', project.id);

  if (deleteError) {
    throw deleteError;
  }

  if (chapters.length > 0) {
    const payload = chapters.map((chapter) => ({
      id: chapter.id,
      project_id: project.id,
      user_id: project.userId,
      title: chapter.title.trim(),
      start_page: chapter.startPage,
      end_page: chapter.endPage,
    }));

    const { error: insertError } = await supabase.from('chapters').insert(payload);

    if (insertError) {
      throw insertError;
    }
  }

  const nextProject = {
    ...project,
    chapters: chapters.slice().sort((a, b) => a.startPage - b.startPage),
  };

  await updateCachedChapters(project.id, nextProject.chapters);

  return nextProject;
}

async function fetchChapters(projectIds: string[]): Promise<ChapterRow[]> {
  if (projectIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .in('project_id', projectIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as ChapterRow[];
}

function mapProjectRow(row: ProjectRow, chapterRows: ChapterRow[]): PDFProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    fileName: row.file_name,
    fileHash: row.file_hash,
    totalPages: row.total_pages,
    currentPage: clampPage(row.current_page, row.total_pages),
    scrollOffset: Number(row.scroll_offset) || 0,
    zoom: Number(row.zoom) || 1,
    zoomMode: toZoomMode(row.zoom_mode),
    uploadedAt: row.uploaded_at,
    lastOpenedAt: row.last_opened_at,
    deadline: row.deadline,
    totalReadingSeconds: row.total_reading_seconds,
    blobKey: row.storage_path,
    chapters: chapterRows
      .filter((chapter) => chapter.project_id === row.id)
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        startPage: chapter.start_page,
        endPage: chapter.end_page,
      }))
      .sort((a, b) => a.startPage - b.startPage),
  };
}

function chapterToRow(project: PDFProject) {
  return (chapter: Chapter): ChapterRow => ({
    id: chapter.id,
    project_id: project.id,
    user_id: project.userId,
    title: chapter.title,
    start_page: chapter.startPage,
    end_page: chapter.endPage,
  });
}

function toZoomMode(value: string | null | undefined): ZoomMode {
  return value === 'fit-width' ? 'fit-width' : 'manual';
}
