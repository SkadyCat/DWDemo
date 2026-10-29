import { createGroundField, groundEffect } from './ground-field.mjs';
export const meta = Object.freeze({ id: 'ground-poison', name: '腐蚀毒池', category: '持续地面', continuous: true, duration: 3 });
const spec = { id: meta.id, color: 7528253 };
export const createBatch = (T, capacity = 32) => createGroundField(T, spec, capacity);
export const createEffect = T => groundEffect(T, spec);
