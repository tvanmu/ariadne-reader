import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Chapter } from '../types';
import {
  calculateChapterProgress,
  getCurrentChapter,
  validateChapter,
} from '../utils/progress';

interface ChapterPanelProps {
  chapters: Chapter[];
  currentPage: number;
  totalPages: number;
  onSave: (chapters: Chapter[]) => Promise<void>;
}

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
  totalPages,
  onSave,
}: ChapterPanelProps) {
  const [draft, setDraft] = useState<ChapterDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextChapter = {
      id: draft.id ?? crypto.randomUUID(),
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

      {currentChapter ? (
        <div className="chapter-current">
          <span>Current</span>
          <strong>{currentChapter.title}</strong>
          <small>{Math.round(currentChapterProgress ?? 0)}% complete</small>
        </div>
      ) : (
        <p className="panel-note">Add chapter ranges if you want structure beyond page progress.</p>
      )}

      <form className="chapter-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft.title}
          placeholder="Chapter title"
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
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
    </section>
  );
}
