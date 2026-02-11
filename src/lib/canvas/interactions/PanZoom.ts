import { Container, type Application, type FederatedPointerEvent } from 'pixi.js';

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
 */

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const ZOOM_SPEED = 0.1;

// Momentum: how quickly the canvas slows down after releasing a drag
const FRICTION = 0.92;
// Velocity below this threshold stops the momentum animation
const VELOCITY_THRESHOLD = 0.1;

// Rubber-band: how much the canvas resists when dragged past the edge
const RUBBER_BAND_FACTOR = 0.3;
// How quickly the canvas springs back from the edge
const SPRING_BACK_SPEED = 0.15;

export class PanZoom {
	private app: Application;
	private world: Container;
	private canvasWidth: number;
	private canvasHeight: number;

	// Drag state
	private isDragging = false;
	private lastPointerX = 0;
	private lastPointerY = 0;

	// Momentum state
	private velocityX = 0;
	private velocityY = 0;

	constructor(app: Application, world: Container, canvasWidth: number, canvasHeight: number) {
		this.app = app;
		this.world = world;
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;

		this.setupPan();
		this.setupZoom();
		this.setupMomentum();
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

	private onDragStart(event: FederatedPointerEvent) {
		this.isDragging = true;
		this.lastPointerX = event.globalX;
		this.lastPointerY = event.globalY;
		// Kill any existing momentum when the user grabs the canvas
		this.velocityX = 0;
		this.velocityY = 0;
	}

	private onDragMove(event: FederatedPointerEvent) {
		if (!this.isDragging) return;

		// How far did the pointer move since last frame?
		const dx = event.globalX - this.lastPointerX;
		const dy = event.globalY - this.lastPointerY;

		// Track velocity for momentum on release
		this.velocityX = dx;
		this.velocityY = dy;

		// Calculate the new position
		let newX = this.world.x + dx;
		let newY = this.world.y + dy;

		// Apply rubber-band effect at the edges.
		// Instead of hard-stopping, we allow dragging past the edge but with
		// increasing resistance (the further you go, the less it moves).
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
		this.app.canvas.addEventListener('wheel', (event: WheelEvent) => {
			event.preventDefault();

			// deltaY > 0 = scroll down = zoom out
			const direction = event.deltaY > 0 ? -1 : 1;
			const newScale = Math.max(
				MIN_ZOOM,
				Math.min(MAX_ZOOM, this.world.scale.x + direction * ZOOM_SPEED)
			);

			// Zoom toward the pointer position.
			// Math: adjust the world position so the point under the cursor stays
			// under the cursor after scaling.
			const pointerX = event.offsetX;
			const pointerY = event.offsetY;
			const worldPosBeforeX = (pointerX - this.world.x) / this.world.scale.x;
			const worldPosBeforeY = (pointerY - this.world.y) / this.world.scale.y;

			this.world.scale.set(newScale);

			this.world.x = pointerX - worldPosBeforeX * newScale;
			this.world.y = pointerY - worldPosBeforeY * newScale;
		}, { passive: false });
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
			if (this.isDragging) return;

			// Apply momentum
			if (Math.abs(this.velocityX) > VELOCITY_THRESHOLD || Math.abs(this.velocityY) > VELOCITY_THRESHOLD) {
				this.world.x += this.velocityX;
				this.world.y += this.velocityY;
				this.velocityX *= FRICTION;
				this.velocityY *= FRICTION;
			} else {
				this.velocityX = 0;
				this.velocityY = 0;
			}

			// Spring back if out of bounds (after momentum or rubber-band)
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

		return {
			// maxX/maxY: how far right/down the world can go (limited so the
			// left/top edge of the canvas doesn't go past the viewport)
			maxX: padding,
			maxY: padding,
			// minX/minY: how far left/up (limited so the right/bottom edge
			// of the canvas stays visible)
			minX: screenW - this.canvasWidth * scale - padding,
			minY: screenH - this.canvasHeight * scale - padding
		};
	}
}
