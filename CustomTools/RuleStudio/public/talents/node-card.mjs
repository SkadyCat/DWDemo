// Place a node card beside its anchor, then keep the entire card inside the workspace.
export function placeNodeCard(bounds, anchor, size, gap = 18, inset = 12) {
  const width = Math.min(size.width, Math.max(0, bounds.width - inset * 2));
  const height = Math.min(size.height, Math.max(0, bounds.height - inset * 2));
  const left = bounds.left + inset, top = bounds.top + inset;
  const right = bounds.left + bounds.width - inset, bottom = bounds.top + bounds.height - inset;
  let x = anchor.right + gap;
  if (x + width > right) x = anchor.left - gap - width;
  return {
    left: Math.max(left, Math.min(right - width, x)),
    top: Math.max(top, Math.min(bottom - height, (anchor.top + anchor.bottom - height) / 2)),
    width, maxHeight: Math.max(0, bounds.height - inset * 2),
  };
}
