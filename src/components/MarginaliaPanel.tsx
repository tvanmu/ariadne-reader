import { useEffect, useState } from 'react';
import { Highlighter, Trash2 } from 'lucide-react';
import type { Highlight } from '../types';

const NOTE_LIMIT = 2000;

interface MarginaliaPanelProps {
  highlights: Highlight[];
  editingHighlightId: string | null;
  onEditingHighlightChange: (highlightId: string | null) => void;
  onJumpToPage: (pageNumber: number) => void;
  onUpdateHighlight: (highlight: Highlight, note: string | null) => Promise<void>;
  onDeleteHighlight: (highlight: Highlight) => Promise<void>;
}

export default function MarginaliaPanel({
  highlights,
  editingHighlightId,
  onEditingHighlightChange,
  onJumpToPage,
  onUpdateHighlight,
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
  onDelete: () => Promise<void>;
}

function MarginaliaRow({
  highlight,
  editing,
  onJump,
  onEdit,
  onStopEditing,
  onSave,
  onDelete,
}: MarginaliaRowProps) {
  const [draftNote, setDraftNote] = useState(highlight.note ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setDraftNote(highlight.note ?? '');
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

  return (
    <article className={`marginalia-row is-${highlight.color}`}>
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
