import { Clock3 } from 'lucide-react';
import type { PDFProject, ReadingSession } from '../types';
import { formatDuration } from '../utils/format';
import { getDeadlineStatus } from '../utils/progress';
import PaceChart from './PaceChart';
import SessionClock from './SessionClock';

interface ReadingStatsProps {
  project: PDFProject;
  readingSessions: ReadingSession[];
}

export default function ReadingStats({ project, readingSessions }: ReadingStatsProps) {
  const deadline = getDeadlineStatus(project);
  const averagePace = calculateAveragePace(readingSessions);

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
          <span>Average pace</span>
          <strong>{averagePace === null ? 'No pace yet' : `${averagePace} pages/hr`}</strong>
        </div>
      </div>
      <PaceChart sessions={readingSessions} dailyTarget={deadline.dailyTarget} />
    </section>
  );
}

function calculateAveragePace(sessions: ReadingSession[]): number | null {
  const totals = sessions.reduce(
    (accumulator, session) => ({
      seconds: accumulator.seconds + session.seconds,
      pagesRead: accumulator.pagesRead + session.pagesRead,
    }),
    { seconds: 0, pagesRead: 0 },
  );

  if (totals.seconds <= 0 || totals.pagesRead <= 0) {
    return null;
  }

  return Math.round((totals.pagesRead / totals.seconds) * 3600);
}
