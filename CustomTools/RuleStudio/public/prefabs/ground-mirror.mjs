import { createGroundField, groundEffect } from './ground-field.mjs';
export const meta = Object.freeze({ id: 'ground-mirror', name: '镜像地面', category: '持续地面', continuous: true, duration: 4 });
const spec = { id: meta.id, color: 0xc9d8f7, mirror: true };
export const createBatch = (T, capacity = 32) => createGroundField(T, spec, capacity);
export const createEffect = T => groundEffect(T, spec);
