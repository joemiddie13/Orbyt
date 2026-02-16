import { Container, type FederatedPointerEvent } from 'pixi.js';
import { gsap } from '../gsapInit';
import { CURSOR_DEFAULT, CURSOR_GRAB, CURSOR_GRABBING } from '../textStyles';

/**
 * DragDrop — makes a PixiJS container draggable with long-press support.
 *
 * The tricky part: both panning and dragging use pointer events on the same
 * canvas. We solve this by using event.stopPropagation() — when you drag an
 * object, the event doesn't bubble up to the stage's pan handler.
 *
 * Long-press: hold for 500ms without moving 5px+ → fires onLongPress callback
 * instead of drag. Used for sticker picker.
 */

const LONG_PRESS_DURATION = 500;
const LONG_PRESS_THRESHOLD = 5;

export interface DragDropOptions {
	/** Called when a drag begins (movement exceeds threshold) */
	onDragStart?: () => void;
	/** Called when a drag ends with the final position */
	onDragEnd?: (x: number, y: number) => void;
	/** Called continuously during drag with intermediate positions */
	onDragMove?: (x: number, y: number) => void;
	/** Called on long-press (500ms hold without movement) with screen coordinates */
	onLongPress?: (screenX: number, screenY: number) => void;
}

/**
 * Makes a container respond to long-press only (no drag).
 * Used for non-owners who can still place sticker reactions.
 */
export function makeLongPressable(target: Container, onLongPress: (screenX: number, screenY: number) => void) {
	let isDown = false;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let startScreenX = 0;
	let startScreenY = 0;
	let fired = false;

	target.eventMode = 'static';
	target.cursor = CURSOR_DEFAULT;

	target.on('pointerdown', (event: FederatedPointerEvent) => {
		isDown = true;
		fired = false;
		startScreenX = event.globalX;
		startScreenY = event.globalY;
		event.stopPropagation();

		longPressTimer = setTimeout(() => {
			if (isDown && !fired) {
				fired = true;
				isDown = false;
				onLongPress(startScreenX, startScreenY);
			}
		}, LONG_PRESS_DURATION);
	});

	target.on('globalpointermove', (event: FederatedPointerEvent) => {
		if (!isDown) return;
		const dx = event.globalX - startScreenX;
		const dy = event.globalY - startScreenY;
		if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_THRESHOLD) {
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		}
	});

	function endPress() {
		isDown = false;
		fired = false;
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	target.on('pointerup', endPress);
	target.on('pointerupoutside', endPress);
}

export function makeDraggable(target: Container, options: DragDropOptions = {}) {
	let isDragging = false;
	let offsetX = 0;
	let offsetY = 0;

	// Long-press tracking
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let startScreenX = 0;
	let startScreenY = 0;
	let longPressFired = false;
	let dragStartFired = false;

	target.eventMode = 'static';
	target.cursor = CURSOR_GRAB;

	target.on('pointerdown', (event: FederatedPointerEvent) => {
		isDragging = true;
		longPressFired = false;
		dragStartFired = false;
		target.cursor = CURSOR_GRABBING;

		startScreenX = event.globalX;
		startScreenY = event.globalY;

		const worldParent = target.parent!;
		const worldX = (event.globalX - worldParent.x) / worldParent.scale.x;
		const worldY = (event.globalY - worldParent.y) / worldParent.scale.y;
		offsetX = worldX - target.x;
		offsetY = worldY - target.y;

		event.stopPropagation();

		// Start long-press timer
		if (options.onLongPress) {
			longPressTimer = setTimeout(() => {
				if (isDragging && !longPressFired) {
					longPressFired = true;
					isDragging = false;
					target.cursor = CURSOR_GRAB;
					options.onLongPress!(startScreenX, startScreenY);
				}
			}, LONG_PRESS_DURATION);
		}
	});

	target.on('globalpointermove', (event: FederatedPointerEvent) => {
		if (!isDragging) return;

		// Check if movement exceeds long-press threshold
		const dx = event.globalX - startScreenX;
		const dy = event.globalY - startScreenY;
		if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_THRESHOLD) {
			// Cancel long-press — user is dragging
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
			// Fire drag start once when movement is confirmed
			if (!dragStartFired) {
				dragStartFired = true;
				options.onDragStart?.();
			}
		}

		if (longPressFired) return;

		const worldParent = target.parent!;
		const worldX = (event.globalX - worldParent.x) / worldParent.scale.x;
		const worldY = (event.globalY - worldParent.y) / worldParent.scale.y;

		target.x = worldX - offsetX;
		target.y = worldY - offsetY;

		options.onDragMove?.(target.x, target.y);
	});

	function endDrag() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		if (!isDragging && !longPressFired) return;
		if (longPressFired) {
			longPressFired = false;
			return;
		}
		isDragging = false;
		target.cursor = CURSOR_GRAB;
		options.onDragEnd?.(target.x, target.y);
	}

	target.on('pointerup', endDrag);
	target.on('pointerupoutside', endDrag);
}

/**
 * Makes a container respond to taps (pointerdown → pointerup without movement).
 * Prevents false taps from drag gestures by tracking movement.
 */
export function makeTappable(target: Container, onTap: () => void) {
	let didMove = false;
	target.on('pointerdown', () => { didMove = false; });
	target.on('globalpointermove', () => { didMove = true; });
	target.on('pointerup', () => {
		if (!didMove) onTap();
	});
}

/**
 * Drag lift animation — scale up + random tilt.
 * Returns the random tilt delta for use in the drop animation.
 */
export function animateDragLift(container: Container, baseRotation = 0): number {
	gsap.killTweensOf(container.scale);
	gsap.killTweensOf(container);

	const liftRotation = (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.02);

	const tl = gsap.timeline();
	tl.to(container.scale, {
		x: 1.05, y: 1.05,
		duration: 0.2,
		ease: 'power2.out',
	}, 0);
	tl.to(container, {
		rotation: baseRotation + liftRotation,
		duration: 0.25,
		ease: 'power2.out',
	}, 0);

	return liftRotation;
}

/**
 * Drag drop animation — squash-stretch impact + wobble settling.
 */
export function animateDragDrop(container: Container, liftRotation: number, baseRotation = 0) {
	gsap.killTweensOf(container.scale);
	gsap.killTweensOf(container);

	const tl = gsap.timeline();

	// Squash on impact
	tl.to(container.scale, {
		x: 1.03, y: 0.97,
		duration: 0.1,
		ease: 'power2.in',
	});

	// Spring back to 1.0
	tl.to(container.scale, {
		x: 1, y: 1,
		duration: 0.3,
		ease: 'elastic.out(1, 0.4)',
	});

	// Wobble rotation back to base
	tl.to(container, {
		rotation: baseRotation - liftRotation * 0.5,
		duration: 0.12,
		ease: 'power2.inOut',
	}, 0);
	tl.to(container, {
		rotation: baseRotation + liftRotation * 0.25,
		duration: 0.15,
		ease: 'sine.inOut',
	});
	tl.to(container, {
		rotation: baseRotation,
		duration: 0.2,
		ease: 'power2.out',
	});
}

/**
 * Hover expand — scale up + subtle lift when the pointer enters.
 * Skips hover animation while the object is being dragged.
 * Returns a cleanup function to remove listeners.
 */
export function makeHoverable(target: Container, scale = 1.03): () => void {
	let isDragging = false;
	let hoverTween: gsap.core.Tween | null = null;

	const onDragStart = () => { isDragging = true; };
	const onDragEnd = () => {
		isDragging = false;
		// Don't snap back here — drag drop animation handles that
	};

	const onOver = () => {
		if (isDragging) return;
		hoverTween?.kill();
		hoverTween = gsap.to(target.scale, {
			x: scale, y: scale,
			duration: 0.25,
			ease: 'power2.out',
			overwrite: 'auto',
		});
	};

	const onOut = () => {
		if (isDragging) return;
		hoverTween?.kill();
		hoverTween = gsap.to(target.scale, {
			x: 1, y: 1,
			duration: 0.3,
			ease: 'power2.out',
			overwrite: 'auto',
		});
	};

	target.on('pointerover', onOver);
	target.on('pointerout', onOut);
	target.on('pointerdown', onDragStart);
	target.on('pointerup', onDragEnd);
	target.on('pointerupoutside', onDragEnd);

	return () => {
		hoverTween?.kill();
		target.off('pointerover', onOver);
		target.off('pointerout', onOut);
		target.off('pointerdown', onDragStart);
		target.off('pointerup', onDragEnd);
		target.off('pointerupoutside', onDragEnd);
	};
}
