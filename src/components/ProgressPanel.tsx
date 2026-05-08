import { MapPinned } from 'lucide-react';
import type { PDFProject } from '../types';
import {
  calculateChapterProgress,
  calculateProgress,
  getCurrentChapter,
  getDeadlineStatus,
} from '../utils/progress';
import MazeIcon from './MazeIcon';

interface ProgressPanelProps {
  project: PDFProject;
  sessionSeconds: number;
}

export default function ProgressPanel({ project, sessionSeconds }: ProgressPanelProps) {
  const progress = calculateProgress(project.currentPage, project.totalPages);
  const deadline = getDeadlineStatus(project);
  const currentChapter = getCurrentChapter(project.chapters, project.currentPage);
  const chapterProgress = calculateChapterProgress(currentChapter, project.currentPage);

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
          <strong>{formatPanelDuration(sessionSeconds)}</strong>
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
      </div>

      <div className="current-chapter">
        <MapPinned size={16} />
        <div>
          <span>Current chapter</span>
          <strong>{currentChapter ? currentChapter.title : 'No chapter active'}</strong>
          {chapterProgress !== null ? <small>{Math.round(chapterProgress)}% of chapter</small> : null}
        </div>
      </div>
    </section>
  );
}

function formatPanelDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}
