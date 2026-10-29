const size = value => Math.max(16, Math.min(16384, Math.round(value)));

// Workspace coordinates, in screen pixels before the editor's viewing zoom.
// Moving the preview frame never changes a widget's (0, 0) screen origin.
export function screenFromPoints(start, end) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: size(Math.abs(end.x - start.x)), height: size(Math.abs(end.y - start.y)) };
}

export function resizeScreen(rect, handle, dx, dy) {
  const next = { ...rect };
  if (handle.includes('e')) next.width = size(rect.width + dx);
  if (handle.includes('s')) next.height = size(rect.height + dy);
  if (handle.includes('w')) { next.width = size(rect.width - dx); next.x = rect.x + rect.width - next.width; }
  if (handle.includes('n')) { next.height = size(rect.height - dy); next.y = rect.y + rect.height - next.height; }
  return next;
}
