import { MapPinned } from 'lucide-react';
import type { PDFProject, ReadingSession } from '../types';
import {
  calculateChapterProgress,
  calculateProgress,
  getCurrentChapter,
  getDeadlineStatus,
} from '../utils/progress';
import { getRecentLocalDateKeys } from '../utils/dateKeys';
import { pluralize } from '../utils/format';
import MazeIcon from './MazeIcon';
import SessionClock from './SessionClock';

interface ProgressPanelProps {
  project: PDFProject;
  readingSessions: ReadingSession[];
}

export default function ProgressPanel({ project, readingSessions }: ProgressPanelProps) {
  const progress = calculateProgress(project.currentPage, project.totalPages);
  const deadline = getDeadlineStatus(project);
  const currentChapter = getCurrentChapter(project.chapters, project.currentPage);
  const chapterProgress = calculateChapterProgress(currentChapter, project.currentPage);
  const showPaceNudge = isBehindThreeDayPace(readingSessions, deadline.dailyTarget);

  return (
    <section className="reader-panel">
      <div className="panel-heading">
        <MazeIcon size={17} />
        <h2>Thread</h2>
      </div>

      <div className="large-progress">
        <span>{Math.round(progress)}%</span>
        <div className="progress-track">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="stat-list">
        <div>
          <span>Pages remaining</span>
          <strong>{deadline.pagesRemaining}</strong>
        </div>
        <div>
          <span>Session</span>
          <strong>
            <SessionClock format={formatPanelDuration} />
          </strong>
        </div>
        <div>
          <span>Daily target</span>
          <strong>
            {deadline.isPast
              ? 'Past due'
              : deadline.dailyTarget === null
                ? 'No deadline'
                : `${deadline.dailyTarget} pages`}
          </strong>
        </div>
        <div>
          <span>Deadline pace</span>
          <strong className={`deadline-pace-value is-${deadline.scheduleStatus}`}>
            {formatDeadlinePace(deadline)}
          </strong>
        </div>
      </div>

      <div className="current-chapter">
        <MapPinned size={16} />
        <div>
          <span>Current chapter</span>
          <strong>{currentChapter ? currentChapter.title : 'No chapter active'}</strong>
          {chapterProgress !== null ? <small>{Math.round(chapterProgress)}% of chapter</small> : null}
        </div>
      </div>

      {showPaceNudge ? (
        <p className="thread-pace-nudge">You're a thread's length behind your pace.</p>
      ) : null}
    </section>
  );
}

function formatDeadlinePace(deadline: ReturnType<typeof getDeadlineStatus>): string {
  if (!deadline.hasDeadline) {
    return 'No deadline';
  }

  if (deadline.scheduleStatus === 'past-due') {
    return 'Past due';
  }

  if (deadline.scheduleStatus === 'complete') {
    return 'Finished';
  }

  if (deadline.scheduleStatus === 'ahead' && deadline.scheduleDeltaPages !== null) {
    return `${pluralize(deadline.scheduleDeltaPages, 'page')} ahead`;
  }

  if (deadline.scheduleStatus === 'behind' && deadline.scheduleDeltaPages !== null) {
    return `${pluralize(Math.abs(deadline.scheduleDeltaPages), 'page')} behind`;
  }

  return 'On pace';
}

function isBehindThreeDayPace(
  sessions: ReadingSession[],
  dailyTarget: number | null,
): boolean {
  if (dailyTarget === null || dailyTarget <= 0) {
    return false;
  }

  const recentDates = new Set(getRecentLocalDateKeys(3));
  const recentPagesRead = sessions
    .filter((session) => recentDates.has(session.date))
    .reduce((total, session) => total + session.pagesRead, 0);

  return recentPagesRead < dailyTarget * 3 * 0.6;
}

function formatPanelDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}
