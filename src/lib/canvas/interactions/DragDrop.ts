import { Container, type FederatedPointerEvent } from 'pixi.js';

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
	target.cursor = 'default';

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
	target.cursor = 'grab';

	target.on('pointerdown', (event: FederatedPointerEvent) => {
		isDragging = true;
		longPressFired = false;
		dragStartFired = false;
		target.cursor = 'grabbing';

		startScreenX = event.globalX;
		startScreenY = event.globalY;

		const worldParent = target.parent;
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
					target.cursor = 'grab';
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

		const worldParent = target.parent;
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
		target.cursor = 'grab';
		options.onDragEnd?.(target.x, target.y);
	}

	target.on('pointerup', endDrag);
	target.on('pointerupoutside', endDrag);
}
