import { CalendarDays, Clock3, Trash2 } from 'lucide-react';
import type { PDFProject } from '../types';
import { formatDate, formatDateTime, formatDuration } from '../utils/format';
import { calculateProgress, getDeadlineStatus } from '../utils/progress';

interface ProjectCardProps {
  project: PDFProject;
  celebrating?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export default function ProjectCard({
  project,
  celebrating = false,
  onOpen,
  onDelete,
}: ProjectCardProps) {
  const progress = calculateProgress(project.currentPage, project.totalPages);
  const deadline = getDeadlineStatus(project);

  return (
    <article className={`project-card${celebrating ? ' celebrating' : ''}`}>
      <div className="card-thread" aria-hidden="true" />

      <button
        className="icon-button danger card-delete"
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${project.title}`}
      >
        <Trash2 size={15} />
      </button>

      <div className="card-rest">
        <h3 className="card-title">{project.title}</h3>
        <p className="card-filename">{project.fileName}</p>

        <div className="card-progress">
          <div className="progress-track" aria-label={`${Math.round(progress)} percent complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="card-progress-meta">
            <span>
              Page {project.currentPage} / {project.totalPages}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      <div className="card-extras">
        <div className="card-meta">
          <span>
            <Clock3 size={13} />
            {formatDateTime(project.lastOpenedAt)}
          </span>
          <span>
            <Clock3 size={13} />
            {formatDuration(project.totalReadingSeconds)} read
          </span>
          <span className={deadline.isPast ? 'past' : ''}>
            <CalendarDays size={13} />
            {project.deadline ? formatDate(project.deadline) : 'No deadline'}
          </span>
          {deadline.dailyTarget !== null && !deadline.isPast ? (
            <span className="card-pace">{deadline.dailyTarget} pages / day</span>
          ) : null}
        </div>
      </div>

      <button className="primary-button full-width card-resume" type="button" onClick={onOpen}>
        Resume reading
      </button>
    </article>
  );
}
