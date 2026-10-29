import { createGroundField, groundEffect } from './ground-field.mjs';
export const meta = Object.freeze({ id: 'ground-shock', name: '感电地面', category: '持续地面', continuous: true, duration: 3 });
const spec = { id: meta.id, color: 0xb09aff };
export const createBatch = (T, capacity = 32) => createGroundField(T, spec, capacity);
export const createEffect = T => groundEffect(T, spec);
