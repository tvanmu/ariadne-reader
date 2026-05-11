import { useEffect, useRef, useState } from 'react';
import { Highlighter, Trash2 } from 'lucide-react';
import type { Highlight, HighlightColor } from '../types';

const NOTE_LIMIT = 2000;
const HIGHLIGHT_COLORS: HighlightColor[] = ['thread', 'sun', 'olive', 'wine'];

interface MarginaliaPanelProps {
  highlights: Highlight[];
  editingHighlightId: string | null;
  onEditingHighlightChange: (highlightId: string | null) => void;
  onJumpToPage: (pageNumber: number) => void;
  onUpdateHighlight: (highlight: Highlight, note: string | null) => Promise<void>;
  onUpdateHighlightColor: (highlight: Highlight, color: HighlightColor) => Promise<void>;
  onDeleteHighlight: (highlight: Highlight) => Promise<void>;
}

export default function MarginaliaPanel({
  highlights,
  editingHighlightId,
  onEditingHighlightChange,
  onJumpToPage,
  onUpdateHighlight,
  onUpdateHighlightColor,
  onDeleteHighlight,
}: MarginaliaPanelProps) {
  const sortedHighlights = highlights
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber || dateTime(a.createdAt) - dateTime(b.createdAt));

  return (
    <section className="reader-panel marginalia-panel">
      <div className="panel-heading">
        <Highlighter size={17} strokeWidth={1.8} />
        <h2>Marginalia</h2>
      </div>

      {sortedHighlights.length === 0 ? (
        <p className="panel-note">Select a line in the page text to leave a threadmark.</p>
      ) : (
        <div className="marginalia-list">
          {sortedHighlights.map((highlight) => (
            <MarginaliaRow
              editing={editingHighlightId === highlight.id}
              highlight={highlight}
              key={highlight.id}
              onDelete={() => onDeleteHighlight(highlight)}
              onEdit={() => onEditingHighlightChange(highlight.id)}
              onJump={() => onJumpToPage(highlight.pageNumber)}
              onSave={(note) => onUpdateHighlight(highlight, note)}
              onColorChange={(color) => onUpdateHighlightColor(highlight, color)}
              onStopEditing={() => onEditingHighlightChange(null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface MarginaliaRowProps {
  highlight: Highlight;
  editing: boolean;
  onJump: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
  onSave: (note: string | null) => Promise<void>;
  onColorChange: (color: HighlightColor) => Promise<void>;
  onDelete: () => Promise<void>;
}

function MarginaliaRow({
  highlight,
  editing,
  onJump,
  onEdit,
  onStopEditing,
  onSave,
  onColorChange,
  onDelete,
}: MarginaliaRowProps) {
  const [draftNote, setDraftNote] = useState(highlight.note ?? '');
  const [saving, setSaving] = useState(false);
  const [savingColor, setSavingColor] = useState<HighlightColor | null>(null);
  const rowRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraftNote(highlight.note ?? '');
      rowRef.current?.scrollIntoView({ block: 'nearest' });
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [editing, highlight.note]);

  async function saveNote() {
    setSaving(true);
    try {
      const note = draftNote.trim();
      await onSave(note.length > 0 ? note : null);
      onStopEditing();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  async function saveColor(color: HighlightColor) {
    if (color === highlight.color || savingColor) {
      return;
    }

    setSavingColor(color);
    try {
      await onColorChange(color);
    } catch {
      return;
    } finally {
      setSavingColor(null);
    }
  }

  return (
    <article className={`marginalia-row is-${highlight.color}`} ref={rowRef}>
      <button className="marginalia-jump" type="button" onClick={onJump}>
        <span className="marginalia-page">Page {highlight.pageNumber}</span>
        <strong>{highlight.excerpt}</strong>
        {highlight.note ? <p>{highlight.note}</p> : <span>No note yet</span>}
      </button>

      {editing ? (
        <form
          className="marginalia-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveNote();
          }}
        >
          <textarea
            aria-label={`Note for page ${highlight.pageNumber}`}
            ref={textareaRef}
            maxLength={NOTE_LIMIT}
            onChange={(event) => setDraftNote(event.target.value)}
            value={draftNote}
          />
          <div className="marginalia-editor-actions">
            <span>{NOTE_LIMIT - draftNote.length}</span>
            <button className="small-button" type="submit" disabled={saving}>
              Save
            </button>
            <button
              className="small-button ghost"
              type="button"
              disabled={saving}
              onClick={onStopEditing}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="marginalia-actions">
          <div className="marginalia-color-swatches" aria-label="Highlight color">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                aria-label={`Change highlight color to ${getHighlightColorLabel(color)}`}
                aria-pressed={highlight.color === color}
                className={`marginalia-color-button is-${color}`}
                disabled={savingColor !== null}
                key={color}
                type="button"
                onClick={() => void saveColor(color)}
              />
            ))}
          </div>
          <button className="small-button ghost" type="button" onClick={onEdit}>
            {highlight.note ? 'Edit note' : 'Add note'}
          </button>
          <button
            aria-label={`Delete highlight on page ${highlight.pageNumber}`}
            className="icon-button danger"
            type="button"
            onClick={() => void onDelete()}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </article>
  );
}

function dateTime(value: string): number {
  return new Date(value).getTime();
}

function getHighlightColorLabel(color: HighlightColor): string {
  if (color === 'sun') {
    return 'sun';
  }

  if (color === 'olive') {
    return 'olive';
  }

  if (color === 'wine') {
    return 'wine';
  }

  return 'thread';
}
