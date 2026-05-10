import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import MazeIcon from './MazeIcon';

interface PdfToolbarProps {
  title: string;
  totalPages: number;
  progress: number;
  zoom: number;
  zoomMode: 'manual' | 'fit-width';
  pageInput: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error' | string;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onBack: () => void;
  onPageInputChange: (value: string) => void;
  onJump: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCycleZoomMode: () => void;
}

export default function PdfToolbar({
  title,
  totalPages,
  progress,
  zoom,
  zoomMode,
  pageInput,
  saveState,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  onBack,
  onPageInputChange,
  onJump,
  onPrevious,
  onNext,
  onZoomIn,
  onZoomOut,
  onCycleZoomMode,
}: PdfToolbarProps) {
  const roundedProgress = Math.round(progress);

  return (
    <div className="reader-toolbar">
      <div className="toolbar-left">
        <button className="icon-text-button subtle" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Library
        </button>
        <button
          className={`panel-toggle${leftOpen ? ' is-active' : ''}`}
          type="button"
          onClick={onToggleLeft}
          aria-label={leftOpen ? 'Hide chapters' : 'Show chapters'}
          aria-pressed={leftOpen}
        >
          <BookMarked size={15} />
          <span>Chapters</span>
        </button>
      </div>

      <div className="toolbar-title" aria-label={`${title}, ${roundedProgress} percent complete`}>
        <strong>{title}</strong>
        <span className="toolbar-progress-badge">
          <span>{roundedProgress}%</span>
        </span>
      </div>

      <div className="toolbar-actions">
        <button className="icon-button" type="button" onClick={onPrevious} aria-label="Previous page">
          <ChevronLeft size={17} />
        </button>
        <form
          className="page-jump"
          onSubmit={(event) => {
            event.preventDefault();
            onJump();
          }}
        >
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(event) => onPageInputChange(event.target.value)}
            aria-label="Jump to page"
          />
          <span>/ {totalPages}</span>
        </form>
        <button className="icon-button" type="button" onClick={onNext} aria-label="Next page">
          <ChevronRight size={17} />
        </button>

        <div className="divider-vertical" />

        <button className="icon-button" type="button" onClick={onZoomOut} aria-label="Zoom out">
          <ZoomOut size={17} />
        </button>
        <button
          className="zoom-pill"
          type="button"
          onClick={onCycleZoomMode}
          aria-label={zoomMode === 'fit-width' ? 'Reset zoom to 100%' : 'Fit page to width'}
        >
          {zoomMode === 'fit-width' ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </button>
        <button className="icon-button" type="button" onClick={onZoomIn} aria-label="Zoom in">
          <ZoomIn size={17} />
        </button>
      </div>

      <div className="toolbar-right">
        <span className={`save-pip ${saveState}`} aria-label={`Save state: ${saveState}`}>
          {saveState === 'saved' ? (
            <Check size={13} />
          ) : saveState === 'error' ? (
            <AlertTriangle size={13} />
          ) : (
            <span className="save-pip-dot" />
          )}
        </span>
        <button
          className={`panel-toggle${rightOpen ? ' is-active' : ''}`}
          type="button"
          onClick={onToggleRight}
          aria-label={rightOpen ? 'Hide thread' : 'Show thread'}
          aria-pressed={rightOpen}
        >
          <MazeIcon size={15} />
          <span>Thread</span>
        </button>
      </div>
    </div>
  );
}
