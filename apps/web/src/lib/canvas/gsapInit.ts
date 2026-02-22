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

// Frame-drop protection: if a frame takes longer than 500ms, GSAP skips
// ahead instead of trying to cram multiple frames of progress into one
// callback (which causes a cascade of expensive catch-up frames).
gsap.ticker.lagSmoothing(500, 33);

export { gsap };
