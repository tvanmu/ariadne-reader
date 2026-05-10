import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PDFProject } from '../types';
import { pdfjsLib } from '../lib/pdf';
import LabyrinthMark from './LabyrinthMark';
import { getPdfBlob } from '../storage/indexedDb';
import {
  downloadPdfBlob,
  fetchProject,
  updateCloudChapters,
  updateCloudDeadline,
  updateCloudProgress,
  updateCloudReadingTime,
} from '../services/projects';
import {
  fetchLocalProject,
  getLocalPdfBlob,
  updateLocalChapters,
  updateLocalDeadline,
  updateLocalProgress,
  updateLocalReadingTime,
} from '../services/localProjects';
import { calculateProgress, clampPage } from '../utils/progress';
import ChapterPanel from './ChapterPanel';
import DeadlineEditor from './DeadlineEditor';
import PdfToolbar from './PdfToolbar';
import ProgressPanel from './ProgressPanel';
import ReadingStats from './ReadingStats';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

const PDF_BASE_SCALE = 1.35;
const BASELINE_CANVAS_OUTPUT_SCALE = 1;
const MAX_CANVAS_OUTPUT_SCALE = 3;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP_PERCENT = 10;
const PAGE_RENDER_RADIUS = 2;
const LEADING_PROGRESS_SAVE_INTERVAL_MS = 4000;
const TRAILING_PROGRESS_SAVE_DELAY_MS = 1200;
const DEFAULT_PAGE_SIZE: PageSize = {
  width: 826,
  height: 1069,
};

interface PageSize {
  width: number;
  height: number;
}

interface PdfReaderProps {
  projectId: string;
  storageMode: 'local' | 'cloud';
  onBack: () => void;
}

export default function PdfReader({ projectId, storageMode, onBack }: PdfReaderProps) {
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
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const saveTimerRef = useRef<number | null>(null);
  const lastProgressSavedAtRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const projectRef = useRef<PDFProject | null>(null);
  const sessionSecondsRef = useRef(0);
  const lastReadingSyncRef = useRef(0);

  const progress = useMemo(
    () => (project ? calculateProgress(currentPage, project.totalPages) : 0),
    [currentPage, project],
  );
  const renderedPageNumbers = useMemo(() => {
    if (!pdfDocument) {
      return new Set<number>();
    }

    const pageNumbers = new Set<number>();
    const startPage = Math.max(currentPage - PAGE_RENDER_RADIUS, 1);
    const endPage = Math.min(currentPage + PAGE_RENDER_RADIUS, pdfDocument.numPages);

    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      pageNumbers.add(pageNumber);
    }

    return pageNumbers;
  }, [currentPage, pdfDocument]);

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
        const loadedProject =
          storageMode === 'cloud' ? await fetchProject(projectId) : await fetchLocalProject(projectId);
        if (!active) {
          return;
        }

        setProject(loadedProject);
        setCurrentPage(loadedProject.currentPage);
        setPageInput(String(loadedProject.currentPage));
        setScrollOffset(loadedProject.scrollOffset);
        setZoom(loadedProject.zoom);

        const cachedBlob = await getPdfBlob(loadedProject.blobKey);
        const pdfBlob =
          cachedBlob ??
          (storageMode === 'cloud'
            ? await downloadPdfBlob(loadedProject)
            : await getLocalPdfBlob(loadedProject));
        const buffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        loadedDocument = await loadingTask.promise;

        if (!active) {
          await loadedDocument.destroy();
          return;
        }

        const measuredPageSizes = await readPageSizes(loadedDocument);
        if (!active) {
          await loadedDocument.destroy();
          return;
        }

        setPageSizes(measuredPageSizes);
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
  }, [projectId, storageMode]);

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
      const updatedProject =
        storageMode === 'cloud'
          ? await updateCloudReadingTime(activeProject, total)
          : await updateLocalReadingTime(activeProject, total);
      setProject((current) =>
        current ? { ...current, totalReadingSeconds: updatedProject.totalReadingSeconds } : current,
      );
    } catch {
      lastReadingSyncRef.current -= delta;
    }
  }, [storageMode]);

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

  const saveProgress = useCallback(
    async (progressState: Pick<PDFProject, 'currentPage' | 'scrollOffset' | 'zoom'>) => {
      const activeProject = projectRef.current;
      if (!activeProject) {
        return;
      }

      setSaveState('saving');

      try {
        const updatedProject =
          storageMode === 'cloud'
            ? await updateCloudProgress(activeProject, progressState)
            : await updateLocalProgress(activeProject, progressState);

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
    },
    [storageMode],
  );

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

    const progressState = { currentPage, scrollOffset, zoom };
    const now = Date.now();

    if (now - lastProgressSavedAtRef.current > LEADING_PROGRESS_SAVE_INTERVAL_MS) {
      lastProgressSavedAtRef.current = now;
      void saveProgress(progressState);
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      lastProgressSavedAtRef.current = Date.now();
      void saveProgress(progressState);
    }, TRAILING_PROGRESS_SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentPage, pdfDocument, project?.id, saveProgress, scrollOffset, zoom]);

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

    const updatedProject =
      storageMode === 'cloud'
        ? await updateCloudDeadline(project, deadline)
        : await updateLocalDeadline(project, deadline);
    setProject(updatedProject);
  }

  async function saveChapters(chapters: PDFProject['chapters']) {
    if (!project) {
      return;
    }

    const updatedProject =
      storageMode === 'cloud'
        ? await updateCloudChapters(project, chapters)
        : await updateLocalChapters(project, chapters);
    setProject(updatedProject);
  }

  if (loading) {
    return (
      <section className="reader-loading">
        <LabyrinthMark size={48} spinning />
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
        totalPages={project.totalPages}
        progress={progress}
        zoom={zoom}
        pageInput={pageInput}
        saveState={saveState}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((open) => !open)}
        onToggleRight={() => setRightOpen((open) => !open)}
        onBack={onBack}
        onPageInputChange={setPageInput}
        onJump={() => scrollToPage(Number(pageInput))}
        onPrevious={() => scrollToPage(currentPage - 1)}
        onNext={() => scrollToPage(currentPage + 1)}
        onZoomIn={() => setZoom((value) => getSteppedZoom(value, 'in'))}
        onZoomOut={() => setZoom((value) => getSteppedZoom(value, 'out'))}
        onResetZoom={() => setZoom(1)}
      />

      <div className={`reader-grid${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}`}>
        <aside className={`reader-side left${leftOpen ? '' : ' is-collapsed'}`}>
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
                  key={pageNumber}
                  document={pdfDocument}
                  pageNumber={pageNumber}
                  pageSize={pageSizes[pageNumber] ?? DEFAULT_PAGE_SIZE}
                  shouldRender={renderedPageNumbers.has(pageNumber)}
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

        <aside className={`reader-side right${rightOpen ? '' : ' is-collapsed'}`}>
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
  pageSize: PageSize;
  shouldRender: boolean;
  zoom: number;
  registerPage: (node: HTMLDivElement | null) => void;
}

function PdfPage({ document, pageNumber, pageSize, shouldRender, zoom, registerPage }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const displayWidth = Math.ceil(pageSize.width * zoom);
  const displayHeight = Math.ceil(pageSize.height * zoom);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas || !shouldRender) {
        return;
      }

      try {
        setRenderError(null);
        const page = await document.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: zoom * PDF_BASE_SCALE });
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas rendering is not available in this browser.');
        }

        const outputScale = getCanvasOutputScale();
        const canvasDisplayWidth = Math.ceil(viewport.width);
        const canvasDisplayHeight = Math.ceil(viewport.height);

        canvas.width = Math.ceil(canvasDisplayWidth * outputScale);
        canvas.height = Math.ceil(canvasDisplayHeight * outputScale);
        canvas.style.width = `${canvasDisplayWidth}px`;
        canvas.style.height = `${canvasDisplayHeight}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        renderTask = page.render({ canvasContext: context, viewport, background: '#ffffff' });
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
  }, [document, pageNumber, shouldRender, zoom]);

  return (
    <div className="pdf-page-frame" ref={registerPage}>
      <div className="page-number-label">Page {pageNumber}</div>
      {renderError ? <p className="form-note error">{renderError}</p> : null}
      <div className="pdf-page-shell" style={{ width: displayWidth, height: displayHeight }}>
        {shouldRender ? <canvas ref={canvasRef} /> : <div className="pdf-page-placeholder" />}
      </div>
    </div>
  );
}

async function readPageSizes(document: PdfDocument): Promise<Record<number, PageSize>> {
  const entries = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const pageNumber = index + 1;
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_BASE_SCALE });
      page.cleanup();

      return [
        pageNumber,
        {
          width: Math.ceil(viewport.width),
          height: Math.ceil(viewport.height),
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function getCanvasOutputScale(): number {
  return Math.min(
    Math.max(window.devicePixelRatio || 1, BASELINE_CANVAS_OUTPUT_SCALE),
    MAX_CANVAS_OUTPUT_SCALE,
  );
}

function getSteppedZoom(value: number, direction: 'in' | 'out'): number {
  const currentPercent = Math.round(value * 100);
  const nextPercent =
    direction === 'in'
      ? Math.ceil((currentPercent + 1) / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT
      : Math.floor((currentPercent - 1) / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextPercent / 100));
}
