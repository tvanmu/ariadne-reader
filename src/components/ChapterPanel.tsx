import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Chapter, PdfOutlineItem } from '../types';
import {
  calculateChapterProgress,
  getCurrentChapter,
  validateChapter,
} from '../utils/progress';
import { uuid } from '../utils/uuid';

interface ChapterPanelProps {
  chapters: Chapter[];
  currentPage: number;
  outlineChapters: Chapter[];
  outlineItems: PdfOutlineItem[];
  totalPages: number;
  onJumpToPage: (pageNumber: number) => void;
  onSave: (chapters: Chapter[]) => Promise<void>;
}

type ChapterPanelTab = 'chapters' | 'contents';

interface ChapterDraft {
  id: string | null;
  title: string;
  startPage: string;
  endPage: string;
}

const emptyDraft: ChapterDraft = {
  id: null,
  title: '',
  startPage: '',
  endPage: '',
};

export default function ChapterPanel({
  chapters,
  currentPage,
  outlineChapters,
  outlineItems,
  totalPages,
  onJumpToPage,
  onSave,
}: ChapterPanelProps) {
  const [draft, setDraft] = useState<ChapterDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ChapterPanelTab>('chapters');
  const hasOutlineContents = outlineItems.length > 0;
  const currentChapter = useMemo(
    () => getCurrentChapter(chapters, currentPage),
    [chapters, currentPage],
  );
  const currentChapterProgress = calculateChapterProgress(currentChapter, currentPage);

  useEffect(() => {
    if (draft.id && !chapters.some((chapter) => chapter.id === draft.id)) {
      setDraft(emptyDraft);
    }
  }, [chapters, draft.id]);

  useEffect(() => {
    if (!hasOutlineContents && activeTab === 'contents') {
      setActiveTab('chapters');
    }
  }, [activeTab, hasOutlineContents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextChapter = {
      id: draft.id ?? uuid(),
      title: draft.title.trim(),
      startPage: Number(draft.startPage),
      endPage: Number(draft.endPage),
    };

    const validation = validateChapter(nextChapter, totalPages);

    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const nextChapters = draft.id
      ? chapters.map((chapter) => (chapter.id === draft.id ? nextChapter : chapter))
      : [...chapters, nextChapter];

    await saveChapters(nextChapters);
    setDraft(emptyDraft);
  }

  async function saveChapters(nextChapters: Chapter[]) {
    setSaving(true);
    setError(null);

    try {
      await onSave(nextChapters.slice().sort((a, b) => a.startPage - b.startPage));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save chapters.');
    } finally {
      setSaving(false);
    }
  }

  async function importOutlineChapters() {
    const invalidChapter = outlineChapters.find(
      (chapter) => !validateChapter(chapter, totalPages).valid,
    );

    if (invalidChapter) {
      setError(`The outline entry "${invalidChapter.title}" falls outside this PDF.`);
      return;
    }

    await saveChapters(outlineChapters);
    setDraft(emptyDraft);
  }

  function editChapter(chapter: Chapter) {
    setDraft({
      id: chapter.id,
      title: chapter.title,
      startPage: String(chapter.startPage),
      endPage: String(chapter.endPage),
    });
    setError(null);
  }

  return (
    <section className="chapter-panel">
      <div className="panel-heading">
        <BookMarked size={17} />
        <h2>Chapters</h2>
      </div>

      {hasOutlineContents ? (
        <div className="chapter-tabs" aria-label="Left rail view">
          <button
            className={`chapter-tab${activeTab === 'chapters' ? ' is-active' : ''}`}
            type="button"
            aria-pressed={activeTab === 'chapters'}
            onClick={() => setActiveTab('chapters')}
          >
            Chapters
          </button>
          <button
            className={`chapter-tab${activeTab === 'contents' ? ' is-active' : ''}`}
            type="button"
            aria-pressed={activeTab === 'contents'}
            onClick={() => setActiveTab('contents')}
          >
            Contents
          </button>
        </div>
      ) : null}

      {activeTab === 'contents' && hasOutlineContents ? (
        <OutlineContents items={outlineItems} onJumpToPage={onJumpToPage} />
      ) : (
        <>
          {currentChapter ? (
            <div className="chapter-current">
              <span>Current</span>
              <strong>{currentChapter.title}</strong>
              <small>{Math.round(currentChapterProgress ?? 0)}% complete</small>
            </div>
          ) : (
            <p className="panel-note">Add chapter ranges if you want structure beyond page progress.</p>
          )}

          {chapters.length === 0 && outlineChapters.length > 0 ? (
            <button
              className="small-button ghost full-width outline-import-button"
              type="button"
              disabled={saving}
              onClick={importOutlineChapters}
            >
              Import {outlineChapters.length}{' '}
              {outlineChapters.length === 1 ? 'chapter' : 'chapters'} from this PDF
            </button>
          ) : null}

          <form className="chapter-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={draft.title}
              placeholder="Chapter title"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
            <div className="chapter-page-grid">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={draft.startPage}
                placeholder="Start"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, startPage: event.target.value }))
                }
              />
              <input
                type="number"
                min={1}
                max={totalPages}
                value={draft.endPage}
                placeholder="End"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, endPage: event.target.value }))
                }
              />
            </div>
            {error ? <p className="form-note error">{error}</p> : null}
            <button className="small-button full-width" type="submit" disabled={saving}>
              {draft.id ? <Pencil size={15} /> : <Plus size={15} />}
              {draft.id ? 'Update chapter' : 'Add chapter'}
            </button>
          </form>

          <div className="chapter-list">
            {chapters.map((chapter) => (
              <div className="chapter-row" key={chapter.id}>
                <button className="chapter-main" type="button" onClick={() => editChapter(chapter)}>
                  <strong>{chapter.title}</strong>
                  <span>
                    {chapter.startPage}-{chapter.endPage}
                  </span>
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => saveChapters(chapters.filter((item) => item.id !== chapter.id))}
                  aria-label={`Delete ${chapter.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

interface OutlineContentsProps {
  items: PdfOutlineItem[];
  depth?: number;
  onJumpToPage: (pageNumber: number) => void;
}

function OutlineContents({ items, depth = 0, onJumpToPage }: OutlineContentsProps) {
  return (
    <div className={depth === 0 ? 'outline-list' : 'outline-list nested'}>
      {items.map((item) => (
        <div className="outline-node" key={item.id}>
          <button
            className={`outline-row${item.pageNumber === null ? ' is-muted' : ''}`}
            type="button"
            disabled={item.pageNumber === null}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            onClick={() => {
              if (item.pageNumber !== null) {
                onJumpToPage(item.pageNumber);
              }
            }}
          >
            <span>{item.title}</span>
            <small>{item.pageNumber === null ? 'Section' : `Page ${item.pageNumber}`}</small>
          </button>
          {item.children.length > 0 ? (
            <OutlineContents
              items={item.children}
              depth={depth + 1}
              onJumpToPage={onJumpToPage}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
