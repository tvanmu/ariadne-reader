import { CalendarDays, Clock3, FileText, Trash2 } from 'lucide-react';
import type { PDFProject } from '../types';
import { formatDate, formatDateTime, formatDuration } from '../utils/format';
import { calculateProgress, getDeadlineStatus } from '../utils/progress';

interface ProjectCardProps {
  project: PDFProject;
  onOpen: () => void;
  onDelete: () => void;
}

export default function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const progress = calculateProgress(project.currentPage, project.totalPages);
  const deadline = getDeadlineStatus(project);

  return (
    <article className="project-card">
      <div className="card-thread" aria-hidden="true" />
      <div className="project-card-top">
        <div className="file-medallion">
          <FileText size={20} />
        </div>
        <button
          className="icon-button danger"
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${project.title}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <h3>{project.title}</h3>
      <p className="file-name">{project.fileName}</p>

      <div className="progress-track" aria-label={`${Math.round(progress)} percent complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="project-stats">
        <span>{Math.round(progress)}% complete</span>
        <span>
          Page {project.currentPage} / {project.totalPages}
        </span>
      </div>

      <div className="project-meta">
        <span>
          <Clock3 size={14} />
          Last opened {formatDateTime(project.lastOpenedAt)}
        </span>
        <span>
          <Clock3 size={14} />
          {formatDuration(project.totalReadingSeconds)} read
        </span>
        <span className={deadline.isPast ? 'past' : ''}>
          <CalendarDays size={14} />
          {project.deadline ? formatDate(project.deadline) : 'No deadline set'}
        </span>
      </div>

      <div className="daily-target-row">
        {deadline.hasDeadline && deadline.isPast
          ? 'Deadline has passed'
          : deadline.dailyTarget !== null
            ? `${deadline.dailyTarget} pages per day`
            : 'Set a deadline in the reader'}
      </div>

      <button className="primary-button full-width" type="button" onClick={onOpen}>
        Resume
      </button>
    </article>
  );
}
