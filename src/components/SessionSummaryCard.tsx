import { ArrowRight, Clock3, MapPinned, Milestone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionSummary } from '../types';
import { formatDuration, pluralize } from '../utils/format';

interface SessionSummaryCardProps {
  summary: SessionSummary;
  onContinue: () => void;
}

export default function SessionSummaryCard({ summary, onContinue }: SessionSummaryCardProps) {
  const remainingPhrase =
    summary.todayPagesRemaining === null
      ? null
      : summary.todayPagesRemaining === 0
        ? 'pace met'
        : `${pluralize(summary.todayPagesRemaining, 'page')} to go`;

  return (
    <section className="session-summary-screen" aria-labelledby="session-summary-title">
      <article className="session-summary-card">
        <span className="eyebrow">Thread gathered</span>
        <h1 id="session-summary-title">
          Today's thread: {pluralize(summary.pagesRead, 'page')}, {formatDuration(summary.seconds)}
          {remainingPhrase ? `. ${remainingPhrase}.` : '.'}
        </h1>
        <p className="muted">{summary.projectTitle}</p>

        <div className="session-summary-grid" aria-label="Session details">
          <SummaryItem
            icon={<Clock3 size={16} />}
            label="Average pace"
            value={summary.averagePace === null ? 'No pace yet' : `${summary.averagePace} pages/hr`}
          />
          <SummaryItem
            icon={<MapPinned size={16} />}
            label="Current chapter"
            value={summary.currentChapterTitle ?? 'No chapter active'}
          />
          <SummaryItem icon={<Milestone size={16} />} label="Deadline" value={formatDeadline(summary)} />
        </div>

        <button className="primary-button" type="button" onClick={onContinue}>
          Continue
          <ArrowRight size={16} />
        </button>
      </article>
    </section>
  );
}

interface SummaryItemProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function SummaryItem({ icon, label, value }: SummaryItemProps) {
  return (
    <div className="session-summary-item">
      <span className="session-summary-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function formatDeadline(summary: SessionSummary): string {
  if (summary.daysRemaining !== null && summary.daysRemaining < 0) {
    return 'Past due';
  }

  if (summary.daysRemaining === null || summary.dailyTarget === null) {
    return 'No deadline';
  }

  if (summary.daysRemaining === 0) {
    return 'Due today';
  }

  return `${pluralize(summary.daysRemaining, 'day')} left`;
}
