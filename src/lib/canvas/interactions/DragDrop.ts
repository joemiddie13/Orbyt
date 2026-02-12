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
	/** Called when a drag ends with the final position */
	onDragEnd?: (x: number, y: number) => void;
	/** Called on long-press (500ms hold without movement) with screen coordinates */
	onLongPress?: (screenX: number, screenY: number) => void;
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

	target.eventMode = 'static';
	target.cursor = 'grab';

	target.on('pointerdown', (event: FederatedPointerEvent) => {
		isDragging = true;
		longPressFired = false;
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
		}

		if (longPressFired) return;

		const worldParent = target.parent;
		const worldX = (event.globalX - worldParent.x) / worldParent.scale.x;
		const worldY = (event.globalY - worldParent.y) / worldParent.scale.y;

		target.x = worldX - offsetX;
		target.y = worldY - offsetY;
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
