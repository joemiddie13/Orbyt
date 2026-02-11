import { Container, type FederatedPointerEvent } from 'pixi.js';

/**
 * DragDrop — makes a PixiJS container draggable.
 *
 * The tricky part: both panning and dragging use pointer events on the same
 * canvas. We solve this by using event.stopPropagation() — when you drag an
 * object, the event doesn't bubble up to the stage's pan handler.
 *
 * PixiJS event flow (similar to DOM):
 * 1. Event fires on the most specific target (the object you clicked)
 * 2. It bubbles up through parent containers to the stage
 * 3. stopPropagation() prevents step 2
 *
 * So: click on object → DragDrop handles it, pan doesn't fire.
 *     click on empty space → nothing stops it, pan fires on the stage.
 */

export interface DragDropOptions {
	/** Called when a drag ends with the final position */
	onDragEnd?: (x: number, y: number) => void;
}

export function makeDraggable(target: Container, options: DragDropOptions = {}) {
	let isDragging = false;
	// Offset from the pointer to the object's origin, so the object doesn't
	// "jump" to center on your cursor when you start dragging.
	let offsetX = 0;
	let offsetY = 0;

	target.eventMode = 'static';
	target.cursor = 'grab';

	target.on('pointerdown', (event: FederatedPointerEvent) => {
		isDragging = true;
		target.cursor = 'grabbing';

		// Calculate offset between pointer and object position.
		// We need to account for the world container's transform (position + scale)
		// because the object's x/y are in world-space, but the pointer is in screen-space.
		const worldParent = target.parent;
		const worldX = (event.globalX - worldParent.x) / worldParent.scale.x;
		const worldY = (event.globalY - worldParent.y) / worldParent.scale.y;
		offsetX = worldX - target.x;
		offsetY = worldY - target.y;

		// This is the key line — stop the event from reaching the stage's
		// pan handler. Without this, dragging an object would also pan the canvas.
		event.stopPropagation();
	});

	target.on('globalpointermove', (event: FederatedPointerEvent) => {
		if (!isDragging) return;

		// Convert screen coordinates to world coordinates
		const worldParent = target.parent;
		const worldX = (event.globalX - worldParent.x) / worldParent.scale.x;
		const worldY = (event.globalY - worldParent.y) / worldParent.scale.y;

		target.x = worldX - offsetX;
		target.y = worldY - offsetY;
	});

	function endDrag() {
		if (!isDragging) return;
		isDragging = false;
		target.cursor = 'grab';
		options.onDragEnd?.(target.x, target.y);
	}

	// Listen globally for pointerup — if you drag fast and your cursor leaves
	// the object, the 'pointerup' on the object won't fire. 'globalpointerup'
	// fires no matter where the cursor is.
	target.on('pointerup', endDrag);
	target.on('pointerupoutside', endDrag);
}
