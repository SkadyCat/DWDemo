// Tiny game-event bus. Player transactions announce what happened; the journey
// layer listens. Emitting never fails the transaction that emitted it.
const target = new EventTarget();

export function emitGameEvent(type, detail = {}) {
  try { target.dispatchEvent(new CustomEvent(type, { detail })); } catch { /* listeners are optional */ }
}

export function onGameEvent(type, listener) {
  const handler = event => listener(event.detail);
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
