import Dexie, { type Table } from 'dexie';
import type { Chapter, Highlight, HighlightUpdateInput, PDFProject } from '../types';

interface CachedPdfBlob {
  key: string;
  blob: Blob;
  savedAt: string;
}

class AriadneDatabase extends Dexie {
  projects!: Table<PDFProject, string>;
  blobs!: Table<CachedPdfBlob, string>;
  highlights!: Table<Highlight, string>;

  constructor() {
    super('ariadne-reader');

    this.version(1).stores({
      projects: 'id, userId, fileName, uploadedAt, lastOpenedAt',
      blobs: 'key, savedAt',
    });

    this.version(2).stores({
      projects: 'id, userId, fileName, uploadedAt, lastOpenedAt',
      blobs: 'key, savedAt',
    });

    this.version(3).stores({
      projects: 'id, userId, fileName, uploadedAt, lastOpenedAt',
      blobs: 'key, savedAt',
    });

    this.version(4).stores({
      projects: 'id, userId, fileName, uploadedAt, lastOpenedAt',
      blobs: 'key, savedAt',
      highlights: 'id, projectId, pageNumber, [projectId+pageNumber], createdAt',
    });
  }
}

const db = new AriadneDatabase();

export async function saveProject(project: PDFProject): Promise<void> {
  await db.projects.put(project);
}

export async function getProjects(): Promise<PDFProject[]> {
  return db.projects
    .toArray()
    .then((projects) =>
      projects.map(withProjectDefaults).sort(
        (a, b) =>
          new Date(b.lastOpenedAt ?? b.uploadedAt).getTime() -
          new Date(a.lastOpenedAt ?? a.uploadedAt).getTime(),
      ),
    );
}

export async function getProject(id: string): Promise<PDFProject | undefined> {
  return db.projects
    .get(id)
    .then((project) => (project ? withProjectDefaults(project) : undefined));
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);

  await db.transaction('rw', db.projects, db.blobs, db.highlights, async () => {
    await db.projects.delete(id);
    await db.highlights.where('projectId').equals(id).delete();
    if (project?.blobKey) {
      await db.blobs.delete(project.blobKey);
    }
  });
}

export async function updateProgress(
  projectId: string,
  progress: Pick<
    PDFProject,
    'currentPage' | 'scrollOffset' | 'zoom' | 'zoomMode' | 'pageTint' | 'lastOpenedAt'
  >,
): Promise<void> {
  await db.projects.update(projectId, progress);
}

export async function savePdfBlob(blobKey: string, blob: Blob): Promise<void> {
  await db.blobs.put({
    key: blobKey,
    blob,
    savedAt: new Date().toISOString(),
  });
}

export async function getPdfBlob(blobKey: string): Promise<Blob | undefined> {
  return db.blobs.get(blobKey).then((entry) => entry?.blob);
}

export async function updateChapters(projectId: string, chapters: Chapter[]): Promise<void> {
  await db.projects.update(projectId, { chapters });
}

export async function updateDeadline(projectId: string, deadline: string | null): Promise<void> {
  await db.projects.update(projectId, { deadline });
}

export async function updateReadingTime(
  projectId: string,
  totalReadingSeconds: number,
): Promise<void> {
  await db.projects.update(projectId, { totalReadingSeconds });
}

export async function fetchHighlights(projectId: string): Promise<Highlight[]> {
  const highlights = await db.highlights.where('projectId').equals(projectId).toArray();

  return sortHighlights(highlights);
}

export async function createHighlight(highlight: Highlight): Promise<void> {
  await db.highlights.put(highlight);
}

export async function updateHighlight(
  highlightId: string,
  updates: HighlightUpdateInput & { updatedAt: string },
): Promise<Highlight> {
  const existingHighlight = await db.highlights.get(highlightId);

  if (!existingHighlight) {
    throw new Error('This highlight could not be found.');
  }

  const nextHighlight = {
    ...existingHighlight,
    ...updates,
  };

  await db.highlights.put(nextHighlight);

  return nextHighlight;
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  await db.highlights.delete(highlightId);
}

function withProjectDefaults(project: PDFProject): PDFProject {
  return {
    ...project,
    zoomMode: project.zoomMode ?? 'manual',
    pageTint: project.pageTint ?? 'paper',
  };
}

function sortHighlights(highlights: Highlight[]): Highlight[] {
  return highlights.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
