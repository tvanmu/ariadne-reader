import type { ReadingSession } from '../types';
import { getRecentLocalDateKeys } from '../utils/dateKeys';

const CHART_DAYS = 14;
const CHART_WIDTH = 224;
const CHART_HEIGHT = 74;
const CHART_PADDING = 6;
const BAR_GAP = 4;

interface PaceChartProps {
  sessions: ReadingSession[];
  dailyTarget: number | null;
}

export default function PaceChart({ sessions, dailyTarget }: PaceChartProps) {
  const dates = getRecentLocalDateKeys(CHART_DAYS);
  const pagesByDate = new Map(sessions.map((session) => [session.date, session.pagesRead]));
  const values = dates.map((date) => pagesByDate.get(date) ?? 0);
  const target = dailyTarget ?? 0;
  const maxValue = Math.max(...values, target, 1);
  const chartTop = CHART_PADDING;
  const chartBottom = CHART_HEIGHT - CHART_PADDING;
  const chartHeight = chartBottom - chartTop;
  const barWidth =
    (CHART_WIDTH - CHART_PADDING * 2 - BAR_GAP * (CHART_DAYS - 1)) / CHART_DAYS;
  const targetY = chartBottom - (target / maxValue) * chartHeight;

  return (
    <svg
      aria-label="Pages read over the last 14 days"
      className="pace-chart"
      role="img"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
    >
      <line
        className="pace-chart-baseline"
        x1={CHART_PADDING}
        x2={CHART_WIDTH - CHART_PADDING}
        y1={chartBottom}
        y2={chartBottom}
      />
      {target > 0 ? (
        <line
          className="pace-chart-target"
          x1={CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y1={targetY}
          y2={targetY}
        />
      ) : null}
      {values.map((value, index) => {
        const barHeight = Math.max((value / maxValue) * chartHeight, value > 0 ? 2 : 0);
        const x = CHART_PADDING + index * (barWidth + BAR_GAP);
        const y = chartBottom - barHeight;

        return (
          <rect
            className={`pace-chart-bar${index === values.length - 1 ? ' is-today' : ''}`}
            height={barHeight}
            key={dates[index]}
            rx={2}
            width={barWidth}
            x={x}
            y={y}
          />
        );
      })}
    </svg>
  );
}
