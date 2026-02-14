/**
 * GSAP initialization — registers PixiPlugin and exports the configured gsap instance.
 * Import this module (or `{ gsap }` from it) before creating any animated objects.
 * GSAP runs its own requestAnimationFrame loop, so no manual update() call is needed.
 */

import gsap from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import * as PIXI from 'pixi.js';

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

export { gsap };
