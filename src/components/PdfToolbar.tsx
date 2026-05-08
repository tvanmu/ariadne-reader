import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface PdfToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  progress: number;
  zoom: number;
  pageInput: string;
  saveState: string;
  onBack: () => void;
  onPageInputChange: (value: string) => void;
  onJump: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export default function PdfToolbar({
  title,
  currentPage,
  totalPages,
  progress,
  zoom,
  pageInput,
  saveState,
  onBack,
  onPageInputChange,
  onJump,
  onPrevious,
  onNext,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: PdfToolbarProps) {
  return (
    <div className="reader-toolbar">
      <button className="icon-text-button subtle" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        Dashboard
      </button>

      <div className="toolbar-title">
        <strong>{title}</strong>
        <small>
          Page {currentPage} / {totalPages} - {Math.round(progress)}%
        </small>
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
        <button className="zoom-pill" type="button" onClick={onResetZoom}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-button" type="button" onClick={onZoomIn} aria-label="Zoom in">
          <ZoomIn size={17} />
        </button>
        <button className="icon-button" type="button" onClick={onResetZoom} aria-label="Reset zoom">
          <RotateCcw size={16} />
        </button>
      </div>

      <span className={`save-state ${saveState}`}>{saveState}</span>
    </div>
  );
}
