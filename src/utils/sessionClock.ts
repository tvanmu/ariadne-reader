import { useSyncExternalStore } from 'react';

interface SessionClockSnapshot {
  baseTotalSeconds: number;
  elapsedSeconds: number;
}

const listeners = new Set<() => void>();

let snapshot: SessionClockSnapshot = {
  baseTotalSeconds: 0,
  elapsedSeconds: 0,
};

export function useSessionClockSnapshot(): SessionClockSnapshot {
  return useSyncExternalStore(subscribeSessionClock, getSessionClockSnapshot, getSessionClockSnapshot);
}

export function resetSessionClock(baseTotalSeconds = 0) {
  setSessionClockSnapshot({
    baseTotalSeconds: sanitizeSeconds(baseTotalSeconds),
    elapsedSeconds: 0,
  });
}

export function setSessionClockElapsedSeconds(elapsedSeconds: number) {
  setSessionClockSnapshot({
    ...snapshot,
    elapsedSeconds: sanitizeSeconds(elapsedSeconds),
  });
}

function subscribeSessionClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSessionClockSnapshot(): SessionClockSnapshot {
  return snapshot;
}

function setSessionClockSnapshot(nextSnapshot: SessionClockSnapshot) {
  if (
    nextSnapshot.baseTotalSeconds === snapshot.baseTotalSeconds &&
    nextSnapshot.elapsedSeconds === snapshot.elapsedSeconds
  ) {
    return;
  }

  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

function sanitizeSeconds(seconds: number): number {
  return Math.max(0, Math.floor(seconds));
}
