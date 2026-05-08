import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { PDFProject } from '../types';
import { pdfjsLib } from '../lib/pdf';
import { getPdfBlob } from '../storage/indexedDb';
import {
  downloadPdfBlob,
  fetchProject,
  updateCloudChapters,
  updateCloudDeadline,
  updateCloudProgress,
  updateCloudReadingTime,
} from '../services/projects';
import { calculateProgress, clampPage } from '../utils/progress';
import ChapterPanel from './ChapterPanel';
import DeadlineEditor from './DeadlineEditor';
import PdfToolbar from './PdfToolbar';
import ProgressPanel from './ProgressPanel';
import ReadingStats from './ReadingStats';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

interface PdfReaderProps {
  projectId: string;
  onBack: () => void;
}

export default function PdfReader({ projectId, onBack }: PdfReaderProps) {
  const [project, setProject] = useState<PDFProject | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const saveTimerRef = useRef<number | null>(null);
  const hasRestoredRef = useRef(false);
  const projectRef = useRef<PDFProject | null>(null);
  const sessionSecondsRef = useRef(0);
  const lastReadingSyncRef = useRef(0);

  const progress = useMemo(
    () => (project ? calculateProgress(currentPage, project.totalPages) : 0),
    [currentPage, project],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    sessionSecondsRef.current = sessionSeconds;
  }, [sessionSeconds]);

  useEffect(() => {
    let active = true;
    let loadedDocument: PdfDocument | null = null;

    async function loadReader() {
      setLoading(true);
      setError(null);

      try {
        const loadedProject = await fetchProject(projectId);
        if (!active) {
          return;
        }

        setProject(loadedProject);
        setCurrentPage(loadedProject.currentPage);
        setPageInput(String(loadedProject.currentPage));
        setScrollOffset(loadedProject.scrollOffset);
        setZoom(loadedProject.zoom);

        const cachedBlob = await getPdfBlob(loadedProject.blobKey);
        const pdfBlob = cachedBlob ?? (await downloadPdfBlob(loadedProject));
        const buffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        loadedDocument = await loadingTask.promise;

        if (!active) {
          await loadedDocument.destroy();
          return;
        }

        setPdfDocument(loadedDocument);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not open this PDF. It may be corrupted or unsupported.',
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReader();

    return () => {
      active = false;
      if (loadedDocument) {
        void loadedDocument.destroy();
      }
    };
  }, [projectId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSessionSeconds((seconds) => seconds + 1);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const flushReadingTime = useCallback(async () => {
    const activeProject = projectRef.current;
    const delta = sessionSecondsRef.current - lastReadingSyncRef.current;

    if (!activeProject || delta <= 0) {
      return;
    }

    lastReadingSyncRef.current = sessionSecondsRef.current;
    const total = activeProject.totalReadingSeconds + delta;

    try {
      const updatedProject = await updateCloudReadingTime(activeProject, total);
      setProject((current) =>
        current ? { ...current, totalReadingSeconds: updatedProject.totalReadingSeconds } : current,
      );
    } catch {
      lastReadingSyncRef.current -= delta;
    }
  }, []);

  useEffect(() => {
    if (sessionSeconds > 0 && sessionSeconds % 15 === 0) {
      void flushReadingTime();
    }
  }, [flushReadingTime, sessionSeconds]);

  useEffect(() => {
    return () => {
      void flushReadingTime();
    };
  }, [flushReadingTime]);

  useEffect(() => {
    if (!pdfDocument || !project || hasRestoredRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (project.scrollOffset > 0 && viewerRef.current) {
        viewerRef.current.scrollTop = project.scrollOffset;
      } else {
        scrollToPage(project.currentPage, 'auto');
      }
      hasRestoredRef.current = true;
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pdfDocument, project]);

  useEffect(() => {
    if (!project || !pdfDocument) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const activeProject = projectRef.current;
      if (!activeProject) {
        return;
      }

      setSaveState('saving');

      try {
        const updatedProject = await updateCloudProgress(activeProject, {
          currentPage,
          scrollOffset,
          zoom,
        });

        setProject((current) =>
          current
            ? {
                ...current,
                currentPage: updatedProject.currentPage,
                scrollOffset: updatedProject.scrollOffset,
                zoom: updatedProject.zoom,
                lastOpenedAt: updatedProject.lastOpenedAt,
              }
            : current,
        );
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentPage, pdfDocument, project, scrollOffset, zoom]);

  function scrollToPage(page: number, behavior: ScrollBehavior = 'smooth') {
    const nextPage = project ? clampPage(page, project.totalPages) : page;
    const node = pageRefs.current.get(nextPage);
    if (node) {
      node.scrollIntoView({ block: 'start', behavior });
    }
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
  }

  function handleScroll() {
    const viewer = viewerRef.current;
    if (!viewer || !project) {
      return;
    }

    const nextScrollOffset = viewer.scrollTop;
    setScrollOffset(nextScrollOffset);

    const viewerRect = viewer.getBoundingClientRect();
    const readingLine = viewerRect.top + viewerRect.height * 0.35;
    let nearestPage = currentPage;
    let nearestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((node, pageNumber) => {
      const rect = node.getBoundingClientRect();
      const distance = Math.abs(rect.top - readingLine);

      if (rect.bottom >= viewerRect.top && rect.top <= viewerRect.bottom && distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = pageNumber;
      }
    });

    if (nearestPage !== currentPage) {
      setCurrentPage(nearestPage);
      setPageInput(String(nearestPage));
    }
  }

  async function saveDeadline(deadline: string | null) {
    if (!project) {
      return;
    }

    const updatedProject = await updateCloudDeadline(project, deadline);
    setProject(updatedProject);
  }

  async function saveChapters(chapters: PDFProject['chapters']) {
    if (!project) {
      return;
    }

    const updatedProject = await updateCloudChapters(project, chapters);
    setProject(updatedProject);
  }

  if (loading) {
    return (
      <section className="reader-loading">
        <Loader2 className="spin" size={26} />
        <span>Preparing the document...</span>
      </section>
    );
  }

  if (error || !project || !pdfDocument) {
    return (
      <section className="reader-error">
        <AlertTriangle size={28} />
        <h1>Could not open this PDF</h1>
        <p>{error ?? 'The reader did not receive a valid document.'}</p>
        <button className="primary-button" type="button" onClick={onBack}>
          Back to dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="reader-shell">
      <PdfToolbar
        title={project.title}
        currentPage={currentPage}
        totalPages={project.totalPages}
        progress={progress}
        zoom={zoom}
        pageInput={pageInput}
        saveState={saveState}
        onBack={onBack}
        onPageInputChange={setPageInput}
        onJump={() => scrollToPage(Number(pageInput))}
        onPrevious={() => scrollToPage(currentPage - 1)}
        onNext={() => scrollToPage(currentPage + 1)}
        onZoomIn={() => setZoom((value) => Math.min(value + 0.15, 2.4))}
        onZoomOut={() => setZoom((value) => Math.max(value - 0.15, 0.65))}
        onResetZoom={() => setZoom(1)}
      />

      <div className="reader-grid">
        <aside className="reader-side left">
          <ChapterPanel
            chapters={project.chapters}
            currentPage={currentPage}
            totalPages={project.totalPages}
            onSave={saveChapters}
          />
        </aside>

        <div className="pdf-viewer" ref={viewerRef} onScroll={handleScroll}>
          <div className="pdf-pages">
            {Array.from({ length: pdfDocument.numPages }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <PdfPage
                  key={`${pageNumber}-${zoom}`}
                  document={pdfDocument}
                  pageNumber={pageNumber}
                  zoom={zoom}
                  registerPage={(node) => {
                    if (node) {
                      pageRefs.current.set(pageNumber, node);
                    } else {
                      pageRefs.current.delete(pageNumber);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>

        <aside className="reader-side right">
          <ProgressPanel project={{ ...project, currentPage }} sessionSeconds={sessionSeconds} />
          <DeadlineEditor project={project} onSave={saveDeadline} />
          <ReadingStats project={project} sessionSeconds={sessionSeconds} />
        </aside>
      </div>
    </section>
  );
}

interface PdfPageProps {
  document: PdfDocument;
  pageNumber: number;
  zoom: number;
  registerPage: (node: HTMLDivElement | null) => void;
}

function PdfPage({ document, pageNumber, zoom, registerPage }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      try {
        setRenderError(null);
        const page = await document.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: zoom * 1.35 });
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas rendering is not available in this browser.');
        }

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (caught) {
        if (!cancelled && !(caught instanceof Error && caught.name === 'RenderingCancelledException')) {
          setRenderError(caught instanceof Error ? caught.message : 'Could not render this page.');
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, zoom]);

  return (
    <div className="pdf-page-frame" ref={registerPage}>
      <div className="page-number-label">Page {pageNumber}</div>
      {renderError ? <p className="form-note error">{renderError}</p> : null}
      <canvas ref={canvasRef} />
    </div>
  );
}
