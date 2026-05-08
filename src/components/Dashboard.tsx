import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { AlertTriangle, BookOpenCheck, Clock3, Cloud, RefreshCw } from 'lucide-react';
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
  const heroRevealFrameRef = useRef<number | null>(null);
  const pendingHeroRevealRef = useRef<{ node: HTMLElement; x: number; y: number } | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [storageMode, user?.id]);

  useEffect(() => {
    return () => {
      if (heroRevealFrameRef.current !== null) {
        window.cancelAnimationFrame(heroRevealFrameRef.current);
      }
    };
  }, []);

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

  function updateHeroReveal(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') {
      return;
    }

    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();

    pendingHeroRevealRef.current = {
      node,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (heroRevealFrameRef.current !== null) {
      return;
    }

    heroRevealFrameRef.current = window.requestAnimationFrame(() => {
      const pending = pendingHeroRevealRef.current;
      if (!pending) {
        heroRevealFrameRef.current = null;
        return;
      }

      pending.node.style.setProperty('--cursor-x', `${pending.x}px`);
      pending.node.style.setProperty('--cursor-y', `${pending.y}px`);
      pending.node.dataset.reveal = 'active';
      heroRevealFrameRef.current = null;
    });
  }

  function hideHeroReveal(event: PointerEvent<HTMLElement>) {
    pendingHeroRevealRef.current = null;
    if (heroRevealFrameRef.current !== null) {
      window.cancelAnimationFrame(heroRevealFrameRef.current);
      heroRevealFrameRef.current = null;
    }
    event.currentTarget.dataset.reveal = 'idle';
  }

  return (
    <section className="dashboard">
      <div
        className="dashboard-hero"
        data-reveal="idle"
        onPointerEnter={updateHeroReveal}
        onPointerMove={updateHeroReveal}
        onPointerLeave={hideHeroReveal}
      >
        <div className="hero-maze-reveal" aria-hidden="true">
          <svg viewBox="0 0 1200 760" preserveAspectRatio="none">
            <path
              className="maze-secondary"
              d="M120 145H335V235H245V325H425V205H590V295H510V415H700V235H905V145H1080"
            />
            <path
              className="maze-secondary"
              d="M95 610H250V520H380V610H545V500H650V590H810V470H965V560H1105"
            />
            <path
              className="maze-primary"
              d="M175 380H315V300H215V205H455V145H625V225H765V330H670V430H875V300H1018V402H930V505H1070"
            />
            <path
              className="maze-primary"
              d="M150 500H280V420H420V330H545V455H485V565H705V455H840V365H955"
            />
            <path
              className="maze-faint"
              d="M70 255H165V340H85M1120 265H1010V350H1118M350 95V175M850 95V230M350 665V585M850 665V565"
            />
          </svg>
        </div>
        <p className="hero-eyebrow">A thread through every PDF</p>
        <h1 className="hero-headline">A clear path through dense documents.</h1>
        <p className="hero-sub">
          {storageMode === 'cloud'
            ? 'Drop a PDF and Ariadne keeps your page, deadline, chapters, and reading time synced to your account.'
            : 'Drop a PDF and start reading. Ariadne saves your place in this browser — sign in anytime to sync.'}
        </p>
        <UploadDropzone onUpload={handleUpload} disabled={uploading} variant="hero" />
        <div className="hero-assurance" aria-label="Ariadne Reader benefits">
          <div className="hero-assurance-item">
            <BookOpenCheck size={16} />
            <div>
              <strong>Resume precisely</strong>
              <span>Page, zoom, and progress are remembered.</span>
            </div>
          </div>
          <div className="hero-assurance-item">
            <Clock3 size={16} />
            <div>
              <strong>Track the work</strong>
              <span>Reading time, deadlines, and pace stay visible.</span>
            </div>
          </div>
          <div className="hero-assurance-item">
            <Cloud size={16} />
            <div>
              <strong>{storageMode === 'cloud' ? 'Synced library' : 'Sync when ready'}</strong>
              <span>
                {storageMode === 'cloud'
                  ? 'Your projects follow your account.'
                  : 'No account required to begin.'}
              </span>
            </div>
          </div>
        </div>
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
