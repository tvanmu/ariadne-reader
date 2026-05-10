import { useEffect, useRef } from 'react';
import { pdfjsLib } from '../lib/pdf';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

interface PdfTextLayerProps {
  pdfDocument: PdfDocument;
  pageNumber: number;
  scale: number;
}

export default function PdfTextLayer({ pdfDocument, pageNumber, scale }: PdfTextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);

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

  return <div className="textLayer pdf-text-layer" ref={layerRef} tabIndex={0} />;
}
