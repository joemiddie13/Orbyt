import { Container, Graphics } from 'pixi.js';
import { gsap } from './gsapInit';
import type { CanvasRenderer } from './CanvasRenderer';

/**
 * LandingTransition — the cinematic moment when a user signs in.
 *
 * Choreography (~2.5s total):
 *   0ms    Auth card dissolves (handled by caller before this runs)
 *   0ms    5 massive concentric pulse rings erupt from epicenter
 *   100ms  Color burst flash (solid amber circle, expand + fade)
 *   200ms  Star field intensifies
 *   300ms  Showcase objects animate out (scale→0, alpha→0, staggered)
 *   1500ms Promise resolves — caller starts loading user's real objects
 *   2500ms Last rings fade (non-blocking background)
 */

const RING_COUNT = 5;
const RING_STAGGER = 150; // ms between each ring
const RING_DURATION = 2.0; // seconds
const RING_MAX_SCALE = 20;
const RING_COLOR = 0xF59E0B; // amber
const BURST_COLOR = 0xF59E0B;

export function runTransition(
	renderer: CanvasRenderer,
	epicenterX: number,
	epicenterY: number,
	landingObjects: Container[],
): Promise<void> {
	return new Promise((resolve) => {
		const world = renderer.world;

		// --- Pulse rings ---
		const ringContainer = new Container();
		ringContainer.x = epicenterX;
		ringContainer.y = epicenterY;
		world.addChild(ringContainer);

		for (let i = 0; i < RING_COUNT; i++) {
			const ring = new Graphics();
			ring.circle(0, 0, 60);
			ring.stroke({ width: 2.5, color: RING_COLOR, alpha: 0.6 });
			ring.alpha = 0.8;
			ring.scale.set(0.1);
			ringContainer.addChild(ring);

			const delay = (i * RING_STAGGER) / 1000;

			gsap.to(ring.scale, {
				x: RING_MAX_SCALE, y: RING_MAX_SCALE,
				duration: RING_DURATION,
				ease: 'power1.out',
				delay,
			});

			gsap.to(ring, {
				alpha: 0,
				duration: RING_DURATION,
				ease: 'power1.out',
				delay,
				onComplete: () => {
					ringContainer.removeChild(ring);
					ring.destroy();
				},
			});
		}

		// --- Color burst flash ---
		const burst = new Graphics();
		burst.circle(0, 0, 40);
		burst.fill({ color: BURST_COLOR, alpha: 0.6 });
		burst.x = epicenterX;
		burst.y = epicenterY;
		burst.scale.set(0);
		burst.alpha = 0.6;
		world.addChild(burst);

		gsap.to(burst.scale, {
			x: 8, y: 8,
			duration: 0.8,
			ease: 'power2.out',
			delay: 0.1,
		});
		gsap.to(burst, {
			alpha: 0,
			duration: 0.8,
			ease: 'power2.out',
			delay: 0.1,
			onComplete: () => {
				world.removeChild(burst);
				burst.destroy();
			},
		});

		// --- Star field intensify ---
		setTimeout(() => {
			// Access the private starField via the renderer — it exposes intensify()
			(renderer as any).starField?.intensify(800);
		}, 200);

		// --- Showcase objects exit ---
		const exitTl = gsap.timeline({ delay: 0.3 });
		for (let i = 0; i < landingObjects.length; i++) {
			const obj = landingObjects[i];
			exitTl.to(obj.scale, {
				x: 0, y: 0,
				duration: 0.35,
				ease: 'power2.in',
			}, i * 0.08);
			exitTl.to(obj, {
				alpha: 0,
				duration: 0.25,
				ease: 'power2.in',
			}, i * 0.08);
		}

		// --- Resolve at 1.5s — let caller load user's real objects ---
		setTimeout(() => {
			resolve();
		}, 1500);

		// --- Cleanup ring container after all rings fade (~2.5s) ---
		setTimeout(() => {
			if (ringContainer.parent) {
				world.removeChild(ringContainer);
			}
			ringContainer.destroy({ children: true });
		}, 3000);
	});
}
