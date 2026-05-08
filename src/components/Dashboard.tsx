import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { PDFProject } from '../types';
import { calculateFileHash } from '../services/fileHash';
import { getPdfPageCount } from '../services/pdfMetadata';
import { createProjectFromPdf, deleteCloudProject, fetchProjects } from '../services/projects';
import {
  createLocalProjectFromPdf,
  deleteLocalProject,
  fetchLocalProjects,
} from '../services/localProjects';
import ProjectCard from './ProjectCard';
import UploadDropzone from './UploadDropzone';

interface DashboardProps {
  user: User | null;
  storageMode: 'local' | 'cloud';
  onOpenProject: (projectId: string) => void;
  onSignIn: () => void;
}

interface PendingUpload {
  file: File;
  fileHash: string;
  totalPages: number;
}

export default function Dashboard({ user, storageMode, onOpenProject, onSignIn }: DashboardProps) {
  const [projects, setProjects] = useState<PDFProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [storageMode, user?.id]);

  const sortedProjects = useMemo(
    () =>
      projects
        .slice()
        .sort(
          (a, b) =>
            new Date(b.lastOpenedAt ?? b.uploadedAt).getTime() -
            new Date(a.lastOpenedAt ?? a.uploadedAt).getTime(),
        ),
    [projects],
  );

  async function loadProjects() {
    setLoading(true);
    setError(null);

    try {
      const nextProjects =
        storageMode === 'cloud' && user ? await fetchProjects(user.id) : await fetchLocalProjects();
      setProjects(nextProjects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your library.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setError(null);
    setUploadMessage(null);
    setPendingUpload(null);

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Ariadne Reader only supports PDF files.');
      return;
    }

    setUploading(true);

    try {
      const buffer = await file.arrayBuffer();
      const [totalPages, fileHash] = await Promise.all([
        getPdfPageCount(buffer),
        calculateFileHash(buffer),
      ]);

      const duplicate = projects.find(
        (project) => project.fileName === file.name && project.totalPages === totalPages,
      );

      const nextPendingUpload = { file, fileHash, totalPages };

      if (duplicate) {
        setPendingUpload(nextPendingUpload);
        setUploadMessage(
          `This looks like a duplicate of "${duplicate.title}" (${totalPages} pages).`,
        );
        return;
      }

      await createAndOpenProjectForMode(nextPendingUpload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'This PDF could not be read. It may be corrupted or unsupported.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function createAndOpenProject(pending: PendingUpload) {
    setUploading(true);
    setError(null);

    try {
      if (!user) {
        throw new Error('Sign in is required before saving to cloud sync.');
      }

      const project = await createProjectFromPdf({
        userId: user.id,
        file: pending.file,
        fileHash: pending.fileHash,
        totalPages: pending.totalPages,
      });

      celebrateAndOpen(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this PDF.');
    } finally {
      setUploading(false);
    }
  }

  async function createAndOpenProjectForMode(pending: PendingUpload) {
    if (storageMode === 'cloud') {
      await createAndOpenProject(pending);
      return;
    }

    await createLocalAndOpenProject(pending);
  }

  async function createLocalAndOpenProject(pending: PendingUpload) {
    setUploading(true);
    setError(null);

    try {
      const project = await createLocalProjectFromPdf({
        file: pending.file,
        fileHash: pending.fileHash,
        totalPages: pending.totalPages,
      });

      celebrateAndOpen(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this PDF.');
    } finally {
      setUploading(false);
    }
  }

  function celebrateAndOpen(project: PDFProject) {
    setProjects((current) => [project, ...current]);
    setPendingUpload(null);
    setUploadMessage(null);
    setCelebratingId(project.id);
    window.setTimeout(() => {
      onOpenProject(project.id);
    }, 520);
  }

  async function handleDelete(project: PDFProject) {
    const confirmed = window.confirm(`Delete "${project.title}" and its stored PDF?`);

    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      if (storageMode === 'cloud') {
        await deleteCloudProject(project);
      } else {
        await deleteLocalProject(project);
      }
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete this project.');
    }
  }

  const showShelf = !loading && sortedProjects.length > 0;
  const showEmptyHint = !loading && sortedProjects.length === 0;

  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <p className="hero-eyebrow">A thread through every PDF</p>
        <h1 className="hero-headline">A clear path through dense documents.</h1>
        <p className="hero-sub">
          {storageMode === 'cloud'
            ? 'Drop a PDF and Ariadne keeps your page, deadline, chapters, and reading time synced to your account.'
            : 'Drop a PDF and start reading. Ariadne saves your place in this browser — sign in anytime to sync.'}
        </p>
        <UploadDropzone onUpload={handleUpload} disabled={uploading} variant="hero" />
        {showEmptyHint && storageMode === 'local' ? (
          <p className="hero-foot">
            No account needed.{' '}
            <button className="inline-link" type="button" onClick={onSignIn}>
              Sign in to sync
            </button>{' '}
            when you're ready.
          </p>
        ) : null}
      </div>

      {uploadMessage ? (
        <div className="notice warning">
          <AlertTriangle size={18} />
          <span>{uploadMessage}</span>
          {pendingUpload ? (
            <button
              className="small-button"
              type="button"
              disabled={uploading}
              onClick={() =>
                storageMode === 'cloud'
                  ? createAndOpenProject(pendingUpload)
                  : createLocalAndOpenProject(pendingUpload)
              }
            >
              Upload anyway
            </button>
          ) : null}
          <button
            className="small-button ghost"
            type="button"
            onClick={() => {
              setPendingUpload(null);
              setUploadMessage(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="notice error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="loading-grid">
          <div className="project-skeleton" />
          <div className="project-skeleton" />
          <div className="project-skeleton" />
        </div>
      ) : null}

      {showShelf ? (
        <>
          <div className="section-heading">
            <h2>Your library</h2>
            <button className="icon-text-button subtle" type="button" onClick={loadProjects}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

          <div className="project-grid">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                celebrating={celebratingId === project.id}
                onOpen={() => onOpenProject(project.id)}
                onDelete={() => handleDelete(project)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
