import { useSessionClockSnapshot } from '../utils/sessionClock';

interface SessionClockProps {
  format: (seconds: number) => string;
  mode?: 'elapsed' | 'total';
}

export default function SessionClock({
  format,
  mode = 'elapsed',
}: SessionClockProps) {
  const { baseTotalSeconds, elapsedSeconds } = useSessionClockSnapshot();
  const seconds = mode === 'total' ? baseTotalSeconds + elapsedSeconds : elapsedSeconds;

  return <>{format(seconds)}</>;
}
