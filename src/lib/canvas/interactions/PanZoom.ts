import { Container, type Application, type FederatedPointerEvent } from 'pixi.js';
import { gsap } from '../gsapInit';

/**
 * PanZoom — handles panning (click-drag to move around) and zooming (scroll
 * wheel to zoom in/out) on the canvas.
 *
 * How it works:
 * Instead of moving every object individually, we move the "world" container.
 * Think of it like moving a piece of paper under a magnifying glass — the glass
 * (viewport) stays still, the paper (world) moves.
 *
 * Key concepts:
 * - The "world" container's x/y position controls panning
 * - The "world" container's scale controls zoom level
 * - We track velocity during drag to create momentum (inertia) when released
 * - Canvas bounds prevent panning beyond the whiteboard edges
 * - Rubber-band effect: when you hit an edge, it stretches slightly and
 *   springs back — like iOS scroll bounce
 * - Minimum zoom is dynamic: canvas always fills at least 75% of the viewport
 */

const MAX_ZOOM = 2.5;
const ZOOM_SPEED = 0.1;
/** Canvas must fill at least this fraction of the viewport at min zoom */
const MIN_CANVAS_FILL = 0.75;

// Momentum: how quickly the canvas slows down after releasing a drag
const FRICTION = 0.92;
// Velocity below this threshold stops the momentum animation
const VELOCITY_THRESHOLD = 0.1;

// Rubber-band: how much the canvas resists when dragged past the edge
const RUBBER_BAND_FACTOR = 0.3;
// How quickly the canvas springs back from the edge
const SPRING_BACK_SPEED = 0.15;

// 3D tactile: subtle depth effects during pan
/** Scale bump when grabbing the canvas (1.0 = no change) */
const GRAB_SCALE_BUMP = 1.012;
/** Max tilt angle in radians during drag (~1.5 degrees) */
const MAX_TILT = 0.026;
/** How quickly tilt follows velocity (0 = none, 1 = instant) */
const TILT_FOLLOW = 0.12;
/** How quickly tilt springs back to zero on release */
const TILT_SETTLE = 0.08;

export class PanZoom {
	private app: Application;
	private world: Container;
	private canvasWidth: number;
	private canvasHeight: number;

	// Lock state — suppresses all interaction during inline editing
	private locked = false;

	// Drag state
	private isDragging = false;
	private lastPointerX = 0;
	private lastPointerY = 0;

	// Momentum state
	private velocityX = 0;
	private velocityY = 0;

	// 3D tilt state
	private tiltX = 0; // current rotation (from horizontal velocity)
	private tiltY = 0; // current skew-like rotation (from vertical velocity)
	private targetTiltX = 0;
	private targetTiltY = 0;
	/** The base scale before grab bump — used to restore after release */
	private preGrabScale = 1;
	private grabLifted = false;

	// Stored listener for cleanup
	private wheelListener: ((event: WheelEvent) => void) | null = null;

	constructor(app: Application, world: Container, canvasWidth: number, canvasHeight: number) {
		this.app = app;
		this.world = world;
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;

		this.setupPan();
		this.setupZoom();
		this.setupMomentum();

		// Center the canvas in the viewport on load
		this.centerCanvas();
	}

	/** Calculate minimum zoom so canvas fills at least 75% of the viewport */
	private getMinZoom(): number {
		const screenW = this.app.screen.width;
		const screenH = this.app.screen.height;
		const scaleX = (screenW * MIN_CANVAS_FILL) / this.canvasWidth;
		const scaleY = (screenH * MIN_CANVAS_FILL) / this.canvasHeight;
		return Math.max(scaleX, scaleY);
	}

	/** Center the canvas in the viewport at a comfortable zoom */
	private centerCanvas() {
		const screenW = this.app.screen.width;
		const screenH = this.app.screen.height;
		// Start at a zoom where the canvas fits nicely
		const fitScale = Math.min(screenW / this.canvasWidth, screenH / this.canvasHeight) * 0.9;
		const scale = Math.max(this.getMinZoom(), Math.min(MAX_ZOOM, fitScale));
		this.world.scale.set(scale);
		this.world.x = (screenW - this.canvasWidth * scale) / 2;
		this.world.y = (screenH - this.canvasHeight * scale) / 2;
	}

	/**
	 * Set up click-and-drag panning.
	 *
	 * PixiJS events work like DOM events but fire on the WebGL canvas.
	 * We listen on app.stage (the root) so you can drag from anywhere,
	 * not just on top of an object.
	 */
	private setupPan() {
		const stage = this.app.stage;

		// Make the stage interactive and set it to capture events across the
		// entire screen, not just where objects are drawn.
		stage.eventMode = 'static';
		stage.hitArea = this.app.screen;

		stage.on('pointerdown', this.onDragStart.bind(this));
		stage.on('pointermove', this.onDragMove.bind(this));
		stage.on('pointerup', this.onDragEnd.bind(this));
		stage.on('pointerupoutside', this.onDragEnd.bind(this));
	}

	/** Lock all pan/zoom interaction (e.g. during inline editing) */
	lock() {
		this.locked = true;
		this.isDragging = false;
		this.velocityX = 0;
		this.velocityY = 0;
		// Reset 3D tilt so canvas doesn't stay skewed during editing
		this.targetTiltX = 0;
		this.targetTiltY = 0;
		this.tiltX = 0;
		this.tiltY = 0;
		this.world.rotation = 0;
		this.world.skew.set(0, 0);
		if (this.grabLifted) {
			this.grabLifted = false;
			gsap.to(this.world.scale, {
				x: this.preGrabScale,
				y: this.preGrabScale,
				duration: 0.2,
				ease: 'power2.out',
			});
		}
	}

	/** Unlock pan/zoom interaction */
	unlock() {
		this.locked = false;
	}

	private onDragStart(event: FederatedPointerEvent) {
		if (this.locked) return;
		this.isDragging = true;
		this.lastPointerX = event.globalX;
		this.lastPointerY = event.globalY;
		// Kill any existing momentum when the user grabs the canvas
		this.velocityX = 0;
		this.velocityY = 0;

		// 3D grab lift — subtle scale bump
		if (!this.grabLifted) {
			this.preGrabScale = this.world.scale.x;
			this.grabLifted = true;
			gsap.to(this.world.scale, {
				x: this.preGrabScale * GRAB_SCALE_BUMP,
				y: this.preGrabScale * GRAB_SCALE_BUMP,
				duration: 0.2,
				ease: 'power2.out',
			});
		}
	}

	private onDragMove(event: FederatedPointerEvent) {
		if (this.locked || !this.isDragging) return;

		// How far did the pointer move since last frame?
		const dx = event.globalX - this.lastPointerX;
		const dy = event.globalY - this.lastPointerY;

		// Track velocity for momentum on release
		this.velocityX = dx;
		this.velocityY = dy;

		// 3D tilt — target follows velocity direction (clamped)
		this.targetTiltX = Math.max(-MAX_TILT, Math.min(MAX_TILT, -dy * 0.003));
		this.targetTiltY = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx * 0.003));

		// Calculate the new position
		let newX = this.world.x + dx;
		let newY = this.world.y + dy;

		// Apply rubber-band effect at the edges.
		const bounds = this.getBounds();
		if (newX > bounds.maxX) {
			const overshoot = newX - bounds.maxX;
			newX = bounds.maxX + overshoot * RUBBER_BAND_FACTOR;
		} else if (newX < bounds.minX) {
			const overshoot = bounds.minX - newX;
			newX = bounds.minX - overshoot * RUBBER_BAND_FACTOR;
		}
		if (newY > bounds.maxY) {
			const overshoot = newY - bounds.maxY;
			newY = bounds.maxY + overshoot * RUBBER_BAND_FACTOR;
		} else if (newY < bounds.minY) {
			const overshoot = bounds.minY - newY;
			newY = bounds.minY - overshoot * RUBBER_BAND_FACTOR;
		}

		this.world.x = newX;
		this.world.y = newY;

		this.lastPointerX = event.globalX;
		this.lastPointerY = event.globalY;
	}

	private onDragEnd() {
		this.isDragging = false;
		// Momentum continues in setupMomentum's ticker

		// 3D settle — ease scale back and zero out tilt target
		if (this.grabLifted) {
			this.grabLifted = false;
			gsap.to(this.world.scale, {
				x: this.preGrabScale,
				y: this.preGrabScale,
				duration: 0.35,
				ease: 'power2.out',
			});
		}
		this.targetTiltX = 0;
		this.targetTiltY = 0;
	}

	/**
	 * Set up scroll-wheel zooming.
	 *
	 * We listen on the actual DOM <canvas> element because PixiJS doesn't
	 * have a built-in wheel event — that's a browser-level event.
	 *
	 * Zoom targets the pointer position: if you zoom in while pointing at
	 * the top-right, it zooms into the top-right (like Google Maps).
	 */
	private setupZoom() {
		this.wheelListener = (event: WheelEvent) => {
			event.preventDefault();
			if (this.locked) return;

			const minZoom = this.getMinZoom();

			// deltaY > 0 = scroll down = zoom out
			const direction = event.deltaY > 0 ? -1 : 1;
			const newScale = Math.max(
				minZoom,
				Math.min(MAX_ZOOM, this.world.scale.x + direction * ZOOM_SPEED)
			);

			// Zoom toward the pointer position.
			const pointerX = event.offsetX;
			const pointerY = event.offsetY;
			const worldPosBeforeX = (pointerX - this.world.x) / this.world.scale.x;
			const worldPosBeforeY = (pointerY - this.world.y) / this.world.scale.y;

			this.world.scale.set(newScale);

			this.world.x = pointerX - worldPosBeforeX * newScale;
			this.world.y = pointerY - worldPosBeforeY * newScale;
		};
		this.app.canvas.addEventListener('wheel', this.wheelListener, { passive: false });
	}

	/** Clean up event listeners — call when destroying the renderer */
	destroy() {
		if (this.wheelListener) {
			this.app.canvas.removeEventListener('wheel', this.wheelListener);
			this.wheelListener = null;
		}
		// Reset any lingering tilt/skew
		gsap.killTweensOf(this.world.scale);
		this.world.rotation = 0;
		this.world.skew.set(0, 0);
	}

	/**
	 * Momentum: after releasing a drag, the canvas drifts to a stop.
	 *
	 * This runs on PixiJS's "ticker" — a callback that fires every frame
	 * (60 times per second). Each frame, we apply the velocity to the world
	 * position and reduce it by friction until it stops.
	 */
	private setupMomentum() {
		this.app.ticker.add(() => {
			// 3D tilt interpolation — runs even during drag
			if (!this.locked) {
				const tiltSpeed = this.isDragging ? TILT_FOLLOW : TILT_SETTLE;
				this.tiltX += (this.targetTiltX - this.tiltX) * tiltSpeed;
				this.tiltY += (this.targetTiltY - this.tiltY) * tiltSpeed;
				// Snap to zero when close enough
				if (Math.abs(this.tiltX) < 0.0001) this.tiltX = 0;
				if (Math.abs(this.tiltY) < 0.0001) this.tiltY = 0;
				// Apply tilt as rotation + skew (subtle perspective illusion)
				this.world.rotation = this.tiltY * 0.5;
				this.world.skew.set(this.tiltY * 0.3, this.tiltX * 0.3);
			}

			if (this.locked || this.isDragging) return;

			const hasVelocity = Math.abs(this.velocityX) > VELOCITY_THRESHOLD
				|| Math.abs(this.velocityY) > VELOCITY_THRESHOLD;

			// Early exit: no velocity and within bounds — nothing to do
			if (!hasVelocity) {
				this.velocityX = 0;
				this.velocityY = 0;

				// Only check bounds when needed (after drag ends or zoom)
				const bounds = this.getBounds();
				const inBounds = this.world.x <= bounds.maxX && this.world.x >= bounds.minX
					&& this.world.y <= bounds.maxY && this.world.y >= bounds.minY;
				if (inBounds) return;
			}

			// Apply momentum
			if (hasVelocity) {
				this.world.x += this.velocityX;
				this.world.y += this.velocityY;
				this.velocityX *= FRICTION;
				this.velocityY *= FRICTION;
			}

			// Spring back if out of bounds
			const bounds = this.getBounds();
			if (this.world.x > bounds.maxX) {
				this.world.x += (bounds.maxX - this.world.x) * SPRING_BACK_SPEED;
				this.velocityX = 0;
			} else if (this.world.x < bounds.minX) {
				this.world.x += (bounds.minX - this.world.x) * SPRING_BACK_SPEED;
				this.velocityX = 0;
			}
			if (this.world.y > bounds.maxY) {
				this.world.y += (bounds.maxY - this.world.y) * SPRING_BACK_SPEED;
				this.velocityY = 0;
			} else if (this.world.y < bounds.minY) {
				this.world.y += (bounds.minY - this.world.y) * SPRING_BACK_SPEED;
				this.velocityY = 0;
			}
		});
	}

	/**
	 * Calculate the allowed position range for the world container.
	 *
	 * The canvas should be bounded — you can't pan forever into empty space.
	 * We add some padding so you can see a bit of the edge (100px).
	 */
	private getBounds() {
		const scale = this.world.scale.x;
		const screenW = this.app.screen.width;
		const screenH = this.app.screen.height;
		const padding = 100;

		const rawMaxX = padding;
		const rawMinX = screenW - this.canvasWidth * scale - padding;
		const rawMaxY = padding;
		const rawMinY = screenH - this.canvasHeight * scale - padding;

		return {
			// When canvas is smaller than viewport, bounds invert — swap them
			// so panning stays smooth and the canvas can float freely within view
			maxX: Math.max(rawMaxX, rawMinX),
			maxY: Math.max(rawMaxY, rawMinY),
			minX: Math.min(rawMaxX, rawMinX),
			minY: Math.min(rawMaxY, rawMinY),
		};
	}
}
