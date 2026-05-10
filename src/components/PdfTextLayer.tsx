import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../lib/pdf';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

interface PdfTextLayerProps {
  pdfDocument: PdfDocument;
  pageNumber: number;
  scale: number;
  searchQuery?: string;
}

export default function PdfTextLayer({
  pdfDocument,
  pageNumber,
  scale,
  searchQuery = '',
}: PdfTextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);

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
    applySearchHighlights(layerRef.current, searchQuery);
  }, [renderVersion, searchQuery]);

  return <div className="textLayer pdf-text-layer" ref={layerRef} tabIndex={0} />;
}

function applySearchHighlights(container: HTMLDivElement | null, searchQuery: string) {
  if (!container) {
    return;
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const textSpans = container.querySelectorAll<HTMLSpanElement>('span');

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
