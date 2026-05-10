import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Highlight,
  HighlightColor,
  HighlightCreateInput,
  HighlightRange,
} from '../types';
import { pdfjsLib } from '../lib/pdf';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

const HIGHLIGHT_COLORS: HighlightColor[] = ['thread', 'sun', 'olive', 'wine'];
const TEXT_ITEM_SELECTOR = 'span.pdf-text-item';

interface PdfTextLayerProps {
  pdfDocument: PdfDocument;
  pageNumber: number;
  scale: number;
  highlights: Highlight[];
  searchQuery?: string;
  onCreateHighlight: (
    input: HighlightCreateInput,
    options: { openNote: boolean },
  ) => Promise<void>;
}

interface PendingTextSelection {
  ranges: HighlightRange[];
  excerpt: string;
  x: number;
  y: number;
}

export default function PdfTextLayer({
  pdfDocument,
  pageNumber,
  scale,
  highlights,
  searchQuery = '',
  onCreateHighlight,
}: PdfTextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<PendingTextSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null;

    async function renderTextLayer() {
      const container = layerRef.current;
      if (!container) {
        return;
      }

      container.replaceChildren();

      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        container.style.setProperty('--scale-factor', String(viewport.scale));

        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          container,
          viewport,
        });

        await textLayer.render();

        if (!cancelled) {
          tagTextItemSpans(container);
          const endOfContent = document.createElement('div');
          endOfContent.className = 'endOfContent';
          container.append(endOfContent);
          setRenderVersion((version) => version + 1);
        }
      } catch {
        return;
      }
    }

    void renderTextLayer();

    return () => {
      cancelled = true;
      textLayer?.cancel();
      layerRef.current?.replaceChildren();
    };
  }, [pdfDocument, pageNumber, scale]);

  useEffect(() => {
    applyHighlightSegments(layerRef.current, highlights);
    applySearchHighlights(layerRef.current, searchQuery);
  }, [highlights, renderVersion, searchQuery]);

  useEffect(() => {
    setPendingSelection(null);
  }, [pageNumber, scale]);

  const captureSelection = useCallback(() => {
    const container = layerRef.current;
    const selection = window.getSelection();

    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setPendingSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const ranges = getHighlightRangesForSelection(container, range);

    if (ranges.length === 0) {
      setPendingSelection(null);
      return;
    }

    const excerpt = selection.toString().replace(/\s+/g, ' ').trim();
    const toolbarPosition = getSelectionToolbarPosition(container, range);

    if (!excerpt || !toolbarPosition) {
      setPendingSelection(null);
      return;
    }

    setPendingSelection({
      ranges,
      excerpt,
      x: toolbarPosition.x,
      y: toolbarPosition.y,
    });
  }, []);

  function scheduleSelectionCapture() {
    window.setTimeout(captureSelection, 0);
  }

  async function createSelectedHighlight(color: HighlightColor, openNote: boolean) {
    if (!pendingSelection) {
      return;
    }

    try {
      await onCreateHighlight(
        {
          pageNumber,
          ranges: pendingSelection.ranges,
          excerpt: pendingSelection.excerpt,
          color,
          note: null,
        },
        { openNote },
      );

      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
    } catch {
      return;
    }
  }

  return (
    <>
      <div
        className="textLayer pdf-text-layer"
        ref={layerRef}
        tabIndex={0}
        onKeyUp={scheduleSelectionCapture}
        onMouseUp={scheduleSelectionCapture}
      />
      {pendingSelection ? (
        <div
          className="highlight-selection-toolbar"
          style={{ left: pendingSelection.x, top: pendingSelection.y }}
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          aria-label="Highlight selection"
        >
          <div className="highlight-swatches" aria-label="Highlight color">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                aria-label={`Highlight ${color}`}
                className={`highlight-swatch is-${color}`}
                key={color}
                type="button"
                onClick={() => void createSelectedHighlight(color, false)}
              />
            ))}
          </div>
          <button
            className="highlight-note-button"
            type="button"
            onClick={() => void createSelectedHighlight('thread', true)}
          >
            Add note
          </button>
        </div>
      ) : null}
    </>
  );
}

function applySearchHighlights(container: HTMLDivElement | null, searchQuery: string) {
  if (!container) {
    return;
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const textSpans = container.querySelectorAll<HTMLSpanElement>(TEXT_ITEM_SELECTOR);

  textSpans.forEach((span) => {
    if (span.classList.contains('markedContent')) {
      return;
    }

    const normalizedText = (span.textContent ?? '').toLocaleLowerCase();
    span.classList.toggle(
      'is-search-match',
      normalizedQuery.length > 0 && normalizedText.includes(normalizedQuery),
    );
  });
}

function tagTextItemSpans(container: HTMLDivElement) {
  getTextItemSpans(container).forEach((span, itemIndex) => {
    span.classList.add('pdf-text-item');
    span.dataset.textItemIndex = String(itemIndex);
    span.dataset.originalText = span.textContent ?? '';
  });
}

function applyHighlightSegments(container: HTMLDivElement | null, highlights: Highlight[]) {
  if (!container) {
    return;
  }

  const segmentsByItem = getHighlightSegmentsByItem(highlights);
  const textSpans = container.querySelectorAll<HTMLSpanElement>(TEXT_ITEM_SELECTOR);

  textSpans.forEach((span) => {
    const itemIndex = Number(span.dataset.textItemIndex);
    const originalText = getOriginalText(span);
    const segments = segmentsByItem.get(itemIndex) ?? [];

    if (segments.length === 0) {
      span.textContent = originalText;
      return;
    }

    span.replaceChildren(...buildHighlightedTextNodes(originalText, segments));
  });
}

function getTextItemSpans(container: HTMLDivElement): HTMLSpanElement[] {
  return Array.from(container.querySelectorAll<HTMLSpanElement>('span')).filter(
    (span) =>
      !span.classList.contains('markedContent') &&
      span.getAttribute('role') !== 'img' &&
      span.textContent !== null,
  );
}

interface HighlightSegment {
  id: string;
  color: HighlightColor;
  startOffset: number;
  endOffset: number;
}

function getHighlightSegmentsByItem(highlights: Highlight[]): Map<number, HighlightSegment[]> {
  const segmentsByItem = new Map<number, HighlightSegment[]>();

  highlights.forEach((highlight) => {
    highlight.ranges.forEach((range) => {
      const segments = segmentsByItem.get(range.itemIndex) ?? [];
      segments.push({
        id: highlight.id,
        color: highlight.color,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      });
      segmentsByItem.set(range.itemIndex, segments);
    });
  });

  segmentsByItem.forEach((segments) => {
    segments.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  });

  return segmentsByItem;
}

function buildHighlightedTextNodes(text: string, segments: HighlightSegment[]): Node[] {
  const nodes: Node[] = [];
  let cursor = 0;

  segments.forEach((segment) => {
    const startOffset = Math.max(Math.min(segment.startOffset, text.length), cursor);
    const endOffset = Math.max(Math.min(segment.endOffset, text.length), startOffset);

    if (startOffset > cursor) {
      nodes.push(document.createTextNode(text.slice(cursor, startOffset)));
    }

    if (endOffset > startOffset) {
      const highlightSpan = document.createElement('span');
      highlightSpan.className = `pdf-highlight-segment is-${segment.color}`;
      highlightSpan.dataset.highlightId = segment.id;
      highlightSpan.textContent = text.slice(startOffset, endOffset);
      nodes.push(highlightSpan);
    }

    cursor = endOffset;
  });

  if (cursor < text.length) {
    nodes.push(document.createTextNode(text.slice(cursor)));
  }

  return nodes;
}

function getHighlightRangesForSelection(
  container: HTMLDivElement,
  selectionRange: Range,
): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  const textSpans = container.querySelectorAll<HTMLSpanElement>(TEXT_ITEM_SELECTOR);
  const startSpan = getTextItemSpanFromNode(selectionRange.startContainer, container);
  const endSpan = getTextItemSpanFromNode(selectionRange.endContainer, container);

  textSpans.forEach((span) => {
    if (!doesRangeIntersectNode(selectionRange, span)) {
      return;
    }

    const itemIndex = Number(span.dataset.textItemIndex);
    const textLength = getOriginalText(span).length;
    const startOffset =
      span === startSpan ? getTextOffsetWithinSpan(span, selectionRange.startContainer, selectionRange.startOffset) : 0;
    const endOffset =
      span === endSpan ? getTextOffsetWithinSpan(span, selectionRange.endContainer, selectionRange.endOffset) : textLength;

    if (Number.isFinite(itemIndex) && endOffset > startOffset) {
      ranges.push({
        itemIndex,
        startOffset: Math.max(Math.min(startOffset, textLength), 0),
        endOffset: Math.max(Math.min(endOffset, textLength), 0),
      });
    }
  });

  return ranges.filter((range) => range.endOffset > range.startOffset);
}

function getTextItemSpanFromNode(
  node: Node,
  container: HTMLDivElement,
): HTMLSpanElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  const span = element?.closest<HTMLSpanElement>(TEXT_ITEM_SELECTOR) ?? null;

  return span && container.contains(span) ? span : null;
}

function getTextOffsetWithinSpan(span: HTMLSpanElement, node: Node, offset: number): number {
  try {
    const range = document.createRange();
    range.selectNodeContents(span);
    range.setEnd(node, offset);
    const textOffset = range.toString().length;
    range.detach();
    return textOffset;
  } catch {
    return 0;
  }
}

function getSelectionToolbarPosition(
  container: HTMLDivElement,
  selectionRange: Range,
): { x: number; y: number } | null {
  const selectionRect = getRangeRect(selectionRange);

  if (!selectionRect) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const x = selectionRect.left - containerRect.left + selectionRect.width / 2;
  const y = selectionRect.top - containerRect.top - 12;

  return {
    x: Math.max(12, Math.min(x, containerRect.width - 12)),
    y: Math.max(8, y),
  };
}

function getRangeRect(range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();

  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  const firstClientRect = Array.from(range.getClientRects()).find(
    (clientRect) => clientRect.width > 0 || clientRect.height > 0,
  );

  return firstClientRect ?? null;
}

function doesRangeIntersectNode(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function getOriginalText(span: HTMLSpanElement): string {
  return span.dataset.originalText ?? span.textContent ?? '';
}
