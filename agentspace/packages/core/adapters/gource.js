// Neural Workflow events -> a log for the real Gource (`gource --log-format custom`):
//   timestamp|username|A/M/D|path
// Built from the same action stream as our viewer (see gource/actions.js), so both show the same history.
// Gource timestamps are whole seconds: time is multiplied by `scale` (default 100); play it with
// `--seconds-per-day <86400/scale>` to see 1 s of the run as 1 s on screen.
import { createActionStream, toGourceLog } from '../gource/actions.js';

export function toGourceLines(events, scale = 100) {
  if (!events.length) return [];
  const S = createActionStream();
  const t0 = events[0].ts;
  events.forEach((ev, i) => S.push(ev, (ev.ts - t0) / 1000, i));
  return toGourceLog(S, Math.floor(t0 / 1000), scale);
}
