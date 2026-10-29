// A masked presentation layer; it never changes the control surface or hit rectangle.
export function edgeMotionLayer(record, asset, node, size) {
  const ns = 'http://www.w3.org/2000/svg';
  if (!record.edgeLayer) {
    record.edgeLayer = document.createElementNS(ns, 'foreignObject');
    record.edgeLayer.setAttribute('data-motion-edge', ''); record.edgeLayer.setAttribute('pointer-events', 'none');
    record.edgeMask = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    record.edgeSpin = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    record.edgeMask.append(record.edgeSpin); record.edgeLayer.append(record.edgeMask); record.group.append(record.edgeLayer);
  }
  record.edgeLayer.setAttribute('width', size.width); record.edgeLayer.setAttribute('height', size.height);
  const color = node.motion?.tint || asset.edge.color;
  Object.assign(record.edgeMask.style, { position: 'absolute', inset: '0', boxSizing: 'border-box', overflow: 'hidden', pointerEvents: 'none',
    padding: `${asset.edge.width}px`, borderRadius: `${asset.edge.radius}px`, mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude' });
  Object.assign(record.edgeSpin.style, { position: 'absolute', inset: '-50%', transformOrigin: '50% 50%',
    background: `conic-gradient(transparent 0deg 205deg, color-mix(in srgb, ${color} 30%, transparent) 245deg, ${color} 285deg, #f5fbff 306deg, transparent 324deg 360deg)` });
  return record.edgeSpin;
}
export function removeEdgeMotion(record) { record.edgeLayer?.remove(); record.edgeLayer = record.edgeMask = record.edgeSpin = null; }
