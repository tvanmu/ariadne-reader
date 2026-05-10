import { Clock3 } from 'lucide-react';
import type { PDFProject } from '../types';
import { formatDateTime, formatDuration } from '../utils/format';
import SessionClock from './SessionClock';

interface ReadingStatsProps {
  project: PDFProject;
}

export default function ReadingStats({ project }: ReadingStatsProps) {
  return (
    <section className="reader-panel">
      <div className="panel-heading">
        <Clock3 size={17} />
        <h2>Reading Time</h2>
      </div>
      <div className="stat-list">
        <div>
          <span>Total</span>
          <strong>
            <SessionClock format={formatDuration} mode="total" />
          </strong>
        </div>
        <div>
          <span>This session</span>
          <strong>
            <SessionClock format={formatDuration} />
          </strong>
        </div>
        <div>
          <span>Last opened</span>
          <strong>{formatDateTime(project.lastOpenedAt)}</strong>
        </div>
      </div>
    </section>
  );
}
