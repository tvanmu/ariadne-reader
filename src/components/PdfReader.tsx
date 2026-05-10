import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PDFProject, ZoomMode } from '../types';
import { pdfjsLib } from '../lib/pdf';
import {
  isSupabaseConfigured,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabase,
} from '../lib/supabase';
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
import {
  applyReadingTimeBackup,
  clearReadingTimeBackup,
  saveReadingTimeBackup,
} from '../services/readingTimeBackup';
import { calculateProgress, clampPage } from '../utils/progress';
import {
  resetSessionClock,
  setSessionClockElapsedSeconds,
} from '../utils/sessionClock';
import ChapterPanel from './ChapterPanel';
import DeadlineEditor from './DeadlineEditor';
import PdfTextLayer from './PdfTextLayer';
import PdfToolbar from './PdfToolbar';
import ProgressPanel from './ProgressPanel';
import ReadingStats from './ReadingStats';
import SearchBar from './SearchBar';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
type PdfPageProxy = Awaited<ReturnType<PdfDocument['getPage']>>;
type PdfTextContent = Awaited<ReturnType<PdfPageProxy['getTextContent']>>;
type PdfTextContentItem = PdfTextContent['items'][number];

const PDF_BASE_SCALE = 1.35;
const BASELINE_CANVAS_OUTPUT_SCALE = 1;
const MAX_CANVAS_OUTPUT_SCALE = 3;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP_PERCENT = 10;
const VIEWER_FIT_WIDTH_MIN_INSET = 68;
const PAGE_RENDER_RADIUS = 2;
const PAGE_SIZE_BATCH_SIZE = 25;
const SEARCH_DEBOUNCE_DELAY_MS = 200;
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

type IdleWorkHandle = {
  type: 'idle' | 'timeout';
  id: number;
};

interface SearchMatch {
  id: string;
  pageNumber: number;
}

interface PageSearchText {
  normalizedText: string;
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
  const [zoomMode, setZoomMode] = useState<ZoomMode>('manual');
  const [pageInput, setPageInput] = useState('1');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [estimatedPageSize, setEstimatedPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [intersectingPageNumbers, setIntersectingPageNumbers] = useState<Set<number>>(
    () => new Set([1]),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1);
  const [searchedPageCount, setSearchedPageCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageObserverRef = useRef<IntersectionObserver | null>(null);
  const intersectingPageNumbersRef = useRef<Set<number>>(new Set());
  const saveTimerRef = useRef<number | null>(null);
  const lastProgressSavedAtRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const projectRef = useRef<PDFProject | null>(null);
  const sessionSecondsRef = useRef(0);
  const lastReadingSyncRef = useRef(0);
  const lastSessionTickAtRef = useRef(Date.now());
  const cloudAccessTokenRef = useRef<string | null>(null);
  const searchTextCacheRef = useRef<Map<number, PageSearchText>>(new Map());

  const progress = useMemo(
    () => (project ? calculateProgress(currentPage, project.totalPages) : 0),
    [currentPage, project],
  );
  const activeSearchMatch = activeSearchMatchIndex >= 0 ? searchMatches[activeSearchMatchIndex] : null;
  const visibleSearchQuery = searchOpen ? searchQuery.trim() : '';
  const renderedPageNumbers = useMemo(() => {
    if (!pdfDocument) {
      return new Set<number>();
    }

    const pageNumbers = new Set<number>();
    const anchorPageNumbers = new Set(intersectingPageNumbers);
    anchorPageNumbers.add(currentPage);

    anchorPageNumbers.forEach((anchorPageNumber) => {
      const startPage = Math.max(anchorPageNumber - PAGE_RENDER_RADIUS, 1);
      const endPage = Math.min(anchorPageNumber + PAGE_RENDER_RADIUS, pdfDocument.numPages);

      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
        pageNumbers.add(pageNumber);
      }
    });

    return pageNumbers;
  }, [currentPage, intersectingPageNumbers, pdfDocument]);

  const updateFitWidthZoom = useCallback(() => {
    if (zoomMode !== 'fit-width') {
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const pageSize = pageSizes[currentPage] ?? estimatedPageSize;
    const nextZoom = getFitWidthZoom(viewer, pageSize);
    setZoom((currentZoom) => (Math.abs(currentZoom - nextZoom) < 0.005 ? currentZoom : nextZoom));
  }, [currentPage, estimatedPageSize, pageSizes, zoomMode]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const recordVisibleSessionElapsed = useCallback((force = false) => {
    const isReadableMoment = force || document.visibilityState === 'visible';
    const now = Date.now();

    if (!isReadableMoment) {
      lastSessionTickAtRef.current = now;
      return sessionSecondsRef.current;
    }

    const elapsedSeconds = Math.floor((now - lastSessionTickAtRef.current) / 1000);

    if (elapsedSeconds <= 0) {
      return sessionSecondsRef.current;
    }

    lastSessionTickAtRef.current += elapsedSeconds * 1000;
    const nextSessionSeconds = sessionSecondsRef.current + elapsedSeconds;
    sessionSecondsRef.current = nextSessionSeconds;
    setSessionClockElapsedSeconds(nextSessionSeconds);

    return nextSessionSeconds;
  }, []);

  useEffect(() => {
    if (storageMode !== 'cloud') {
      cloudAccessTokenRef.current = null;
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        cloudAccessTokenRef.current = data.session?.access_token ?? null;
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      cloudAccessTokenRef.current = nextSession?.access_token ?? null;
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [storageMode]);

  useEffect(() => {
    let active = true;
    let loadedDocument: PdfDocument | null = null;
    let cancelPageSizeRead: (() => void) | null = null;

    async function loadReader() {
      setLoading(true);
      setError(null);
      sessionSecondsRef.current = 0;
      lastReadingSyncRef.current = 0;
      lastSessionTickAtRef.current = Date.now();
      resetSessionClock();
      setEstimatedPageSize(DEFAULT_PAGE_SIZE);
      setPageSizes({});
      searchTextCacheRef.current.clear();
      setSearchMatches([]);
      setActiveSearchMatchIndex(-1);
      setSearchedPageCount(0);
      setIsSearching(false);

      try {
        const loadedProject =
          storageMode === 'cloud' ? await fetchProject(projectId) : await fetchLocalProject(projectId);
        if (!active) {
          return;
        }

        const projectWithBackedUpTime = applyReadingTimeBackup(loadedProject);
        resetSessionClock(projectWithBackedUpTime.totalReadingSeconds);

        setProject(projectWithBackedUpTime);
        setCurrentPage(projectWithBackedUpTime.currentPage);
        setPageInput(String(projectWithBackedUpTime.currentPage));
        setIntersectingPageNumbers(new Set([projectWithBackedUpTime.currentPage]));
        setScrollOffset(projectWithBackedUpTime.scrollOffset);
        setZoom(projectWithBackedUpTime.zoom);
        setZoomMode(projectWithBackedUpTime.zoomMode);

        if (projectWithBackedUpTime.totalReadingSeconds > loadedProject.totalReadingSeconds) {
          void persistRecoveredReadingTime(projectWithBackedUpTime);
        }

        const cachedBlob = await getPdfBlob(projectWithBackedUpTime.blobKey);
        const pdfBlob =
          cachedBlob ??
          (storageMode === 'cloud'
            ? await downloadPdfBlob(projectWithBackedUpTime)
            : await getLocalPdfBlob(projectWithBackedUpTime));
        const buffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        loadedDocument = await loadingTask.promise;

        if (!active) {
          await loadedDocument.destroy();
          return;
        }

        const anchorPageSize = await readPageSize(loadedDocument, projectWithBackedUpTime.currentPage);
        if (!active) {
          await loadedDocument.destroy();
          return;
        }

        setEstimatedPageSize(anchorPageSize);
        setPageSizes({ [projectWithBackedUpTime.currentPage]: anchorPageSize });
        setPdfDocument(loadedDocument);
        cancelPageSizeRead = readPageSizesInIdleBatches(loadedDocument, (measuredPageSizes) => {
          if (!active) {
            return;
          }

          setPageSizes((currentPageSizes) => ({
            ...currentPageSizes,
            ...measuredPageSizes,
          }));
        });
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
      cancelPageSizeRead?.();
      if (loadedDocument) {
        void loadedDocument.destroy();
      }
    };
  }, [projectId, storageMode]);

  const flushReadingTime = useCallback(async () => {
    const activeProject = projectRef.current;
    const delta = sessionSecondsRef.current - lastReadingSyncRef.current;

    if (!activeProject || delta <= 0) {
      return;
    }

    lastReadingSyncRef.current = sessionSecondsRef.current;
    const total = activeProject.totalReadingSeconds + delta;
    saveReadingTimeBackup(activeProject.id, total);

    try {
      const updatedProject =
        storageMode === 'cloud'
          ? await updateCloudReadingTime(activeProject, total)
          : await updateLocalReadingTime(activeProject, total);
      projectRef.current = {
        ...activeProject,
        totalReadingSeconds: updatedProject.totalReadingSeconds,
      };
      clearReadingTimeBackup(activeProject.id);
      setProject((current) =>
        current ? { ...current, totalReadingSeconds: updatedProject.totalReadingSeconds } : current,
      );
    } catch {
      lastReadingSyncRef.current -= delta;
    }
  }, [storageMode]);

  const flushReadingTimeForPageHide = useCallback(() => {
    recordVisibleSessionElapsed(true);

    const activeProject = projectRef.current;
    const delta = sessionSecondsRef.current - lastReadingSyncRef.current;

    if (!activeProject || delta <= 0) {
      return;
    }

    lastReadingSyncRef.current = sessionSecondsRef.current;
    const total = activeProject.totalReadingSeconds + delta;
    saveReadingTimeBackup(activeProject.id, total);
    projectRef.current = {
      ...activeProject,
      totalReadingSeconds: total,
    };

    if (storageMode === 'cloud') {
      queueCloudReadingTimeKeepalive(activeProject, total, cloudAccessTokenRef.current);
      return;
    }

    void updateLocalReadingTime(activeProject, total)
      .then(() => clearReadingTimeBackup(activeProject.id))
      .catch(() => undefined);
  }, [recordVisibleSessionElapsed, storageMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextSessionSeconds = recordVisibleSessionElapsed();

      if (nextSessionSeconds - lastReadingSyncRef.current >= 15) {
        void flushReadingTime();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [flushReadingTime, recordVisibleSessionElapsed]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        recordVisibleSessionElapsed(true);
        void flushReadingTime();
      } else {
        lastSessionTickAtRef.current = Date.now();
      }
    }

    function handlePageHide() {
      flushReadingTimeForPageHide();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      recordVisibleSessionElapsed(true);
      void flushReadingTime();
    };
  }, [flushReadingTime, flushReadingTimeForPageHide, recordVisibleSessionElapsed]);

  async function persistRecoveredReadingTime(recoveredProject: PDFProject) {
    try {
      const updatedProject =
        storageMode === 'cloud'
          ? await updateCloudReadingTime(recoveredProject, recoveredProject.totalReadingSeconds)
          : await updateLocalReadingTime(recoveredProject, recoveredProject.totalReadingSeconds);
      projectRef.current = {
        ...recoveredProject,
        totalReadingSeconds: updatedProject.totalReadingSeconds,
      };
      clearReadingTimeBackup(recoveredProject.id);
      setProject((current) =>
        current?.id === recoveredProject.id
          ? { ...current, totalReadingSeconds: updatedProject.totalReadingSeconds }
          : current,
      );
    } catch {
      saveReadingTimeBackup(recoveredProject.id, recoveredProject.totalReadingSeconds);
    }
  }

  const saveProgress = useCallback(
    async (
      progressState: Pick<PDFProject, 'currentPage' | 'scrollOffset' | 'zoom' | 'zoomMode'>,
    ) => {
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
                zoomMode: updatedProject.zoomMode,
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
    updateFitWidthZoom();
  }, [leftOpen, rightOpen, updateFitWidthZoom]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || zoomMode !== 'fit-width') {
      return;
    }

    const observer = new ResizeObserver(() => updateFitWidthZoom());
    observer.observe(viewer);

    return () => observer.disconnect();
  }, [updateFitWidthZoom, zoomMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !pdfDocument) {
      return;
    }

    const intersectingPageNumbers = intersectingPageNumbersRef.current;
    intersectingPageNumbers.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        let hasIntersectionChanges = false;

        entries.forEach((entry) => {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (!Number.isInteger(pageNumber)) {
            return;
          }

          if (entry.isIntersecting) {
            if (!intersectingPageNumbers.has(pageNumber)) {
              intersectingPageNumbers.add(pageNumber);
              hasIntersectionChanges = true;
            }
          } else if (intersectingPageNumbers.delete(pageNumber)) {
            hasIntersectionChanges = true;
          }
        });

        if (hasIntersectionChanges) {
          setIntersectingPageNumbers(new Set(intersectingPageNumbers));
        }

        if (!hasRestoredRef.current || intersectingPageNumbers.size === 0) {
          return;
        }

        const nextPage = Math.min(...intersectingPageNumbers);
        setCurrentPage(nextPage);
        setPageInput(String(nextPage));
      },
      {
        root: viewer,
        rootMargin: '-35% 0px -55% 0px',
      },
    );

    pageObserverRef.current = observer;
    pageRefs.current.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      if (pageObserverRef.current === observer) {
        pageObserverRef.current = null;
      }
      intersectingPageNumbers.clear();
    };
  }, [pdfDocument]);

  useEffect(() => {
    if (!project || !pdfDocument) {
      return;
    }

    const progressState = { currentPage, scrollOffset, zoom, zoomMode };
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
  }, [currentPage, pdfDocument, project?.id, saveProgress, scrollOffset, zoom, zoomMode]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }

    window.addEventListener('keydown', handleSearchShortcut);

    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (!pdfDocument || !searchOpen) {
      setIsSearching(false);
      return;
    }

    const normalizedQuery = normalizeSearchText(searchQuery);

    if (!normalizedQuery) {
      setSearchMatches([]);
      setActiveSearchMatchIndex(-1);
      setSearchedPageCount(0);
      setIsSearching(false);
      return;
    }

    const searchableDocument = pdfDocument;
    let cancelled = false;
    const searchTimer = window.setTimeout(() => {
      void searchDocument();
    }, SEARCH_DEBOUNCE_DELAY_MS);

    async function searchDocument() {
      const nextMatches: SearchMatch[] = [];
      setSearchMatches([]);
      setActiveSearchMatchIndex(-1);
      setSearchedPageCount(0);
      setIsSearching(true);

      for (let pageNumber = 1; pageNumber <= searchableDocument.numPages; pageNumber += 1) {
        if (cancelled) {
          return;
        }

        const pageText = await readPageSearchText(
          searchableDocument,
          pageNumber,
          searchTextCacheRef.current,
        );

        if (cancelled) {
          return;
        }

        nextMatches.push(...findSearchMatches(pageText, normalizedQuery, pageNumber));
        setSearchedPageCount(pageNumber);

        if (nextMatches.length > 0) {
          const streamedMatches = [...nextMatches];
          setSearchMatches(streamedMatches);
          setActiveSearchMatchIndex((matchIndex) => (matchIndex === -1 ? 0 : matchIndex));
        }

        if (pageNumber % 8 === 0) {
          await yieldToMainThread();
        }
      }

      if (!cancelled) {
        setSearchMatches([...nextMatches]);
        setActiveSearchMatchIndex((matchIndex) => {
          if (nextMatches.length === 0) {
            return -1;
          }

          return matchIndex === -1 ? 0 : Math.min(matchIndex, nextMatches.length - 1);
        });
        setIsSearching(false);
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(searchTimer);
    };
  }, [pdfDocument, searchOpen, searchQuery]);

  useEffect(() => {
    if (!activeSearchMatch || !searchOpen) {
      return;
    }

    scrollToPage(activeSearchMatch.pageNumber);
  }, [activeSearchMatch?.id, activeSearchMatch?.pageNumber, searchOpen]);

  useEffect(() => {
    if (activeSearchMatchIndex >= searchMatches.length) {
      setActiveSearchMatchIndex(searchMatches.length > 0 ? searchMatches.length - 1 : -1);
    }
  }, [activeSearchMatchIndex, searchMatches.length]);

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

    setScrollOffset(viewer.scrollTop);
  }

  function goToPreviousSearchMatch() {
    if (searchMatches.length === 0) {
      return;
    }

    setActiveSearchMatchIndex((matchIndex) =>
      matchIndex <= 0 ? searchMatches.length - 1 : matchIndex - 1,
    );
  }

  function goToNextSearchMatch() {
    if (searchMatches.length === 0) {
      return;
    }

    setActiveSearchMatchIndex((matchIndex) =>
      matchIndex < 0 || matchIndex >= searchMatches.length - 1 ? 0 : matchIndex + 1,
    );
  }

  function zoomManually(direction: 'in' | 'out') {
    setZoomMode('manual');
    setZoom((value) => getSteppedZoom(value, direction));
  }

  function cycleZoomMode() {
    if (zoomMode === 'fit-width') {
      setZoomMode('manual');
      setZoom(1);
      return;
    }

    if (Math.round(zoom * 100) === 100) {
      setZoomMode('fit-width');
      return;
    }

    setZoomMode('manual');
    setZoom(1);
  }

  const registerPage = useCallback((pageNumber: number, node: HTMLDivElement | null) => {
    const previousNode = pageRefs.current.get(pageNumber);
    const observer = pageObserverRef.current;

    if (previousNode && previousNode !== node) {
      observer?.unobserve(previousNode);
      intersectingPageNumbersRef.current.delete(pageNumber);
    }

    if (node) {
      pageRefs.current.set(pageNumber, node);
      observer?.observe(node);
    } else {
      pageRefs.current.delete(pageNumber);
      if (intersectingPageNumbersRef.current.delete(pageNumber)) {
        setIntersectingPageNumbers(new Set(intersectingPageNumbersRef.current));
      }
    }
  }, []);

  async function saveDeadline(deadline: string | null) {
    if (!project) {
      return;
    }

    const updatedProject =
      storageMode === 'cloud'
        ? await updateCloudDeadline(project, deadline)
        : await updateLocalDeadline(project, deadline);
    setProject((current) =>
      current ? { ...current, deadline: updatedProject.deadline } : current,
    );
  }

  async function saveChapters(chapters: PDFProject['chapters']) {
    if (!project) {
      return;
    }

    const updatedProject =
      storageMode === 'cloud'
        ? await updateCloudChapters(project, chapters)
        : await updateLocalChapters(project, chapters);
    setProject((current) =>
      current ? { ...current, chapters: updatedProject.chapters } : current,
    );
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
        zoomMode={zoomMode}
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
        onZoomIn={() => zoomManually('in')}
        onZoomOut={() => zoomManually('out')}
        onCycleZoomMode={cycleZoomMode}
      />
      {searchOpen ? (
        <SearchBar
          query={searchQuery}
          totalMatches={searchMatches.length}
          activeMatchNumber={activeSearchMatchIndex >= 0 ? activeSearchMatchIndex + 1 : 0}
          searchedPages={searchedPageCount}
          totalPages={pdfDocument.numPages}
          isSearching={isSearching}
          onQueryChange={setSearchQuery}
          onPrevious={goToPreviousSearchMatch}
          onNext={goToNextSearchMatch}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}

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
                  pageSize={pageSizes[pageNumber] ?? estimatedPageSize}
                  shouldRender={renderedPageNumbers.has(pageNumber)}
                  zoom={zoom}
                  searchQuery={visibleSearchQuery}
                  isActiveSearchPage={activeSearchMatch?.pageNumber === pageNumber}
                  registerPage={registerPage}
                />
              );
            })}
          </div>
        </div>

        <aside className={`reader-side right${rightOpen ? '' : ' is-collapsed'}`}>
          <ProgressPanel project={{ ...project, currentPage }} />
          <DeadlineEditor project={project} onSave={saveDeadline} />
          <ReadingStats project={project} />
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
  searchQuery: string;
  isActiveSearchPage: boolean;
  registerPage: (pageNumber: number, node: HTMLDivElement | null) => void;
}

function PdfPage({
  document,
  pageNumber,
  pageSize,
  shouldRender,
  zoom,
  searchQuery,
  isActiveSearchPage,
  registerPage,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const displayWidth = Math.ceil(pageSize.width * zoom);
  const displayHeight = Math.ceil(pageSize.height * zoom);
  const pageFrameRef = useCallback(
    (node: HTMLDivElement | null) => registerPage(pageNumber, node),
    [pageNumber, registerPage],
  );

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
    <div
      className={`pdf-page-frame${isActiveSearchPage ? ' is-search-active' : ''}`}
      data-page-number={pageNumber}
      ref={pageFrameRef}
    >
      <div className="page-number-label">Page {pageNumber}</div>
      {renderError ? <p className="form-note error">{renderError}</p> : null}
      <div className="pdf-page-shell" style={{ width: displayWidth, height: displayHeight }}>
        {shouldRender ? (
          <>
            <canvas ref={canvasRef} />
            <PdfTextLayer
              pdfDocument={document}
              pageNumber={pageNumber}
              scale={zoom * PDF_BASE_SCALE}
              searchQuery={searchQuery}
            />
          </>
        ) : (
          <div className="pdf-page-placeholder" />
        )}
      </div>
    </div>
  );
}

function readPageSizesInIdleBatches(
  document: PdfDocument,
  onBatch: (pageSizes: Record<number, PageSize>) => void,
): () => void {
  let cancelled = false;
  let nextPageNumber = 1;
  let pendingHandle: IdleWorkHandle | null = null;

  function scheduleNextBatch() {
    pendingHandle = scheduleIdleWork(() => {
      void measureNextBatch();
    });
  }

  async function measureNextBatch() {
    pendingHandle = null;

    const batchStart = nextPageNumber;
    const batchEnd = Math.min(document.numPages, batchStart + PAGE_SIZE_BATCH_SIZE - 1);
    const measuredPageSizes: Record<number, PageSize> = {};
    nextPageNumber = batchEnd + 1;

    try {
      for (let pageNumber = batchStart; pageNumber <= batchEnd; pageNumber += 1) {
        if (cancelled) {
          return;
        }

        measuredPageSizes[pageNumber] = await readPageSize(document, pageNumber);
      }
    } catch {
      return;
    }

    if (cancelled) {
      return;
    }

    onBatch(measuredPageSizes);

    if (nextPageNumber <= document.numPages) {
      scheduleNextBatch();
    }
  }

  scheduleNextBatch();

  return () => {
    cancelled = true;

    if (pendingHandle) {
      cancelIdleWork(pendingHandle);
    }
  };
}

async function readPageSize(document: PdfDocument, pageNumber: number): Promise<PageSize> {
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: PDF_BASE_SCALE });
  page.cleanup();

  return {
    width: Math.ceil(viewport.width),
    height: Math.ceil(viewport.height),
  };
}

async function readPageSearchText(
  document: PdfDocument,
  pageNumber: number,
  cache: Map<number, PageSearchText>,
): Promise<PageSearchText> {
  const cachedText = cache.get(pageNumber);
  if (cachedText) {
    return cachedText;
  }

  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text = textContent.items
    .filter(isTextContentItem)
    .map((item) => `${item.str}${item.hasEOL ? '\n' : ''}`)
    .join('');
  const pageSearchText = {
    normalizedText: normalizeSearchText(text),
  };

  cache.set(pageNumber, pageSearchText);
  page.cleanup();

  return pageSearchText;
}

function isTextContentItem(
  item: PdfTextContentItem,
): item is PdfTextContentItem & { str: string; hasEOL: boolean } {
  return 'str' in item;
}

function findSearchMatches(
  pageText: PageSearchText,
  normalizedQuery: string,
  pageNumber: number,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let searchStart = 0;

  while (searchStart < pageText.normalizedText.length) {
    const matchIndex = pageText.normalizedText.indexOf(normalizedQuery, searchStart);

    if (matchIndex === -1) {
      break;
    }

    matches.push({
      id: `${pageNumber}:${matchIndex}:${matches.length}`,
      pageNumber,
    });
    searchStart = matchIndex + Math.max(normalizedQuery.length, 1);
  }

  return matches;
}

function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function scheduleIdleWork(callback: () => void): IdleWorkHandle {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    return { type: 'idle', id: idleWindow.requestIdleCallback(callback) };
  }

  return { type: 'timeout', id: window.setTimeout(callback, 0) };
}

function cancelIdleWork(handle: IdleWorkHandle) {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
  };

  if (handle.type === 'idle' && typeof idleWindow.cancelIdleCallback === 'function') {
    idleWindow.cancelIdleCallback(handle.id);
    return;
  }

  if (handle.type === 'timeout') {
    window.clearTimeout(handle.id);
  }
}

function getCanvasOutputScale(): number {
  return Math.min(
    Math.max(window.devicePixelRatio || 1, BASELINE_CANVAS_OUTPUT_SCALE),
    MAX_CANVAS_OUTPUT_SCALE,
  );
}

function queueCloudReadingTimeKeepalive(
  project: PDFProject,
  totalReadingSeconds: number,
  accessToken: string | null,
): boolean {
  if (!isSupabaseConfigured || !accessToken || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return false;
  }

  const safeSeconds = Math.max(Math.floor(totalReadingSeconds), 0);
  const url = `${SUPABASE_URL}/rest/v1/pdf_projects?id=eq.${encodeURIComponent(project.id)}`;

  // sendBeacon cannot provide the PATCH method or Supabase auth headers; keepalive is the unload-safe path here.
  void fetch(url, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ total_reading_seconds: safeSeconds }),
  }).catch(() => undefined);

  return true;
}

function getSteppedZoom(value: number, direction: 'in' | 'out'): number {
  const currentPercent = Math.round(value * 100);
  const nextPercent =
    direction === 'in'
      ? Math.ceil((currentPercent + 1) / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT
      : Math.floor((currentPercent - 1) / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextPercent / 100));
}

function getFitWidthZoom(viewer: HTMLDivElement, pageSize: PageSize): number {
  const pages = viewer.querySelector<HTMLElement>('.pdf-pages');
  const pagesStyle = pages ? window.getComputedStyle(pages) : null;
  const horizontalInset = pagesStyle
    ? parseCssPixels(pagesStyle.paddingLeft) + parseCssPixels(pagesStyle.paddingRight)
    : VIEWER_FIT_WIDTH_MIN_INSET;
  const availableWidth = Math.max(viewer.clientWidth - horizontalInset, 240);
  const unscaledPageWidth = pageSize.width / PDF_BASE_SCALE;
  const nextZoom = availableWidth / unscaledPageWidth / PDF_BASE_SCALE;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
}

function parseCssPixels(value: string): number {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
