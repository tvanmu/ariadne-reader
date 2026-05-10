import type { Chapter, PdfOutlineItem } from '../types';
import { pdfjsLib } from '../lib/pdf';
import { clampPage } from '../utils/progress';
import { uuid } from '../utils/uuid';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

interface PdfOutlineEntry {
  title: string;
  dest: string | unknown[] | null;
  items?: PdfOutlineEntry[];
}

interface PdfPageRef {
  num: number;
  gen: number;
}

interface OutlineChapterStart {
  title: string;
  startPage: number;
}

export async function extractChaptersFromOutline(pdfDocument: PdfDocument): Promise<Chapter[]> {
  const outline = ((await pdfDocument.getOutline()) ?? []) as PdfOutlineEntry[];
  const chapterStarts: OutlineChapterStart[] = [];
  const usedStartPages = new Set<number>();

  for (const entry of outline) {
    const startPage = await resolveOutlinePage(pdfDocument, entry.dest);

    if (!startPage || usedStartPages.has(startPage)) {
      continue;
    }

    usedStartPages.add(startPage);
    chapterStarts.push({
      title: entry.title.trim() || `Page ${startPage}`,
      startPage,
    });
  }

  return chapterStarts
    .sort((a, b) => a.startPage - b.startPage)
    .map((chapterStart, index, sortedStarts) => ({
      id: uuid(),
      title: chapterStart.title,
      startPage: chapterStart.startPage,
      endPage: (sortedStarts[index + 1]?.startPage ?? pdfDocument.numPages + 1) - 1,
    }));
}

export async function extractOutlineItems(pdfDocument: PdfDocument): Promise<PdfOutlineItem[]> {
  const outline = ((await pdfDocument.getOutline()) ?? []) as PdfOutlineEntry[];
  return resolveOutlineItems(pdfDocument, outline, 'outline');
}

async function resolveOutlineItems(
  pdfDocument: PdfDocument,
  entries: PdfOutlineEntry[],
  parentId: string,
): Promise<PdfOutlineItem[]> {
  const items: PdfOutlineItem[] = [];

  for (const [index, entry] of entries.entries()) {
    const pageNumber = await resolveOutlinePage(pdfDocument, entry.dest).catch(() => null);
    const children = await resolveOutlineItems(
      pdfDocument,
      entry.items ?? [],
      `${parentId}-${index}`,
    );

    if (!pageNumber && children.length === 0) {
      continue;
    }

    items.push({
      id: `${parentId}-${index}-${pageNumber ?? 'group'}`,
      title: entry.title.trim() || (pageNumber ? `Page ${pageNumber}` : 'Untitled'),
      pageNumber,
      children,
    });
  }

  return items;
}

async function resolveOutlinePage(
  pdfDocument: PdfDocument,
  destination: string | unknown[] | null,
): Promise<number | null> {
  const explicitDestination =
    typeof destination === 'string' ? await pdfDocument.getDestination(destination) : destination;

  if (!Array.isArray(explicitDestination) || explicitDestination.length === 0) {
    return null;
  }

  const pageTarget = explicitDestination[0];

  if (isPdfPageRef(pageTarget)) {
    const pageIndex = await pdfDocument.getPageIndex(pageTarget);
    return clampPage(pageIndex + 1, pdfDocument.numPages);
  }

  if (Number.isInteger(pageTarget)) {
    return clampPage(Number(pageTarget) + 1, pdfDocument.numPages);
  }

  return null;
}

function isPdfPageRef(value: unknown): value is PdfPageRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'num' in value &&
    'gen' in value &&
    Number.isInteger(value.num) &&
    Number.isInteger(value.gen)
  );
}
