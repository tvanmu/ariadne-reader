import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { PDFProject } from '../types';
import { pluralize } from '../utils/format';
import { getDeadlineStatus } from '../utils/progress';

interface DeadlineEditorProps {
  project: PDFProject;
  onSave: (deadline: string | null) => Promise<void>;
}

export default function DeadlineEditor({ project, onSave }: DeadlineEditorProps) {
  const [deadline, setDeadline] = useState(project.deadline ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = getDeadlineStatus({ ...project, deadline: deadline || null });
  const statusNote = getDeadlineStatusNote(status);

  useEffect(() => {
    setDeadline(project.deadline ?? '');
  }, [project.deadline]);

  async function save(nextDeadline: string | null) {
    setSaving(true);
    setError(null);

    try {
      await onSave(nextDeadline);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save deadline.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="reader-panel">
      <div className="panel-heading">
        <CalendarClock size={17} />
        <h2>Deadline</h2>
      </div>

      <div className="deadline-editor">
        <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        <button className="small-button" type="button" disabled={saving} onClick={() => save(deadline || null)}>
          Save
        </button>
        <button
          className="small-button ghost"
          type="button"
          disabled={saving || !project.deadline}
          onClick={() => save(null)}
        >
          Clear
        </button>
      </div>

      {status.hasDeadline ? (
        <p className={status.isPast || status.scheduleStatus === 'behind' ? 'panel-warning' : 'panel-note'}>
          {statusNote}
        </p>
      ) : (
        <p className="panel-note">No deadline set.</p>
      )}
      {error ? <p className="form-note error">{error}</p> : null}
    </section>
  );
}

function getDeadlineStatusNote(status: ReturnType<typeof getDeadlineStatus>): string {
  if (status.isPast) {
    return 'This deadline is in the past.';
  }

  const target = `${pluralize(status.dailyTarget ?? 0, 'page')} per day from here.`;

  if (status.scheduleStatus === 'ahead' && status.scheduleDeltaPages !== null) {
    return `${target} You're ${pluralize(status.scheduleDeltaPages, 'page')} ahead of schedule.`;
  }

  if (status.scheduleStatus === 'behind' && status.scheduleDeltaPages !== null) {
    return `${target} You're ${pluralize(Math.abs(status.scheduleDeltaPages), 'page')} behind schedule.`;
  }

  if (status.scheduleStatus === 'complete') {
    return "You're finished before the deadline.";
  }

  return `${target} You're on schedule.`;
}
