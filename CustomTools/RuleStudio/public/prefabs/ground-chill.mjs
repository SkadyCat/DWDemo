import { createGroundField, groundEffect } from './ground-field.mjs';
export const meta = Object.freeze({ id: 'ground-chill', name: '冰缓霜域', category: '持续地面', continuous: true, duration: 3 });
const spec = { id: meta.id, color: 8118271 };
export const createBatch = (T, capacity = 32) => createGroundField(T, spec, capacity);
export const createEffect = T => groundEffect(T, spec);
