import Dexie, { type Table } from 'dexie';
import type { Chapter, PDFProject } from '../types';

interface CachedPdfBlob {
  key: string;
  blob: Blob;
  savedAt: string;
}

class AriadneDatabase extends Dexie {
  projects!: Table<PDFProject, string>;
  blobs!: Table<CachedPdfBlob, string>;

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

  await db.transaction('rw', db.projects, db.blobs, async () => {
    await db.projects.delete(id);
    if (project?.blobKey) {
      await db.blobs.delete(project.blobKey);
    }
  });
}

export async function updateProgress(
  projectId: string,
  progress: Pick<PDFProject, 'currentPage' | 'scrollOffset' | 'zoom' | 'zoomMode' | 'lastOpenedAt'>,
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

function withProjectDefaults(project: PDFProject): PDFProject {
  return {
    ...project,
    zoomMode: project.zoomMode ?? 'manual',
  };
}
