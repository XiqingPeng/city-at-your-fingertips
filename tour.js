export const STOP_DURATION_MS = 30_000;

// A fresh viewing interval starts after an interaction, tab switch or completed load.
// A stopped or slow async map request cannot arm a second timer after resuming.
export function createTourClock(advance, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const holds = new Set();
  let timer = null;
  let revision = 0;

  function schedule() {
    const scheduled = ++revision;
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (holds.size > 0) return;

    timer = setTimer(async () => {
      timer = null;
      try {
        await advance();
      } finally {
        if (scheduled === revision) schedule();
      }
    }, STOP_DURATION_MS);
  }

  function hold(reason, active) {
    if (holds.has(reason) === active) return;
    if (active) holds.add(reason);
    else holds.delete(reason);
    schedule();
  }

  schedule();
  return { hold };
}
