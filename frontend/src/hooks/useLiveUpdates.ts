import { useEffect, useRef } from 'react';

const STREAM_URL = '/backend/api/live';

type Listener = () => void;

// One stream for the whole tab, opened while at least one page listens.
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let timer: number | undefined;

function notifyAll() {
  // A single action can touch several rows (a review, a loan edit...): reload once for the burst.
  window.clearTimeout(timer);
  timer = window.setTimeout(() => listeners.forEach((l) => l()), 300);
}

function open() {
  let dropped = false;
  source = new EventSource(STREAM_URL);
  source.onmessage = notifyAll;
  source.onerror = () => {
    dropped = true;
  };
  // Whatever changed while the connection was down never reached us — catch up.
  source.onopen = () => {
    if (dropped) notifyAll();
    dropped = false;
  };
}

/**
 * Reloads the page's data whenever the backend says something it shows has
 * changed — a payment reported, approved or scored, a loan edited... — so
 * nobody has to refresh by hand. The stream reconnects on its own.
 */
export function useLiveUpdates(reload: () => unknown) {
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  }, [reload]);

  useEffect(() => {
    const listener = () => void latest.current();
    listeners.add(listener);
    if (!source) open();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && source) {
        source.close();
        source = null;
      }
    };
  }, []);
}
