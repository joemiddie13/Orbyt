import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { makeDraggable } from '../interactions/DragDrop';

/**
 * TextBlock — a sticky-note-style object on the canvas.
 *
 * In PixiJS, you build visual objects by composing primitives:
 * - Container: groups things together (like a <div>)
 * - Graphics: draws shapes (the rounded rectangle background)
 * - Text: renders text (the content inside)
 *
 * The container holds both the background shape and the text, so when you
 * move or scale the container, everything moves together.
 */

const PADDING = 16;
const CORNER_RADIUS = 12;
const DEFAULT_WIDTH = 240;

export interface TextBlockOptions {
	/** Convex document _id — links this visual to the database record */
	objectId?: string;
	/** Called when the user finishes dragging this block */
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	/** Called continuously during drag with intermediate positions */
	onDragMove?: (objectId: string, x: number, y: number) => void;
	/** Called on long-press (500ms hold) — triggers sticker picker */
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
}

export class TextBlock {
	/** The PixiJS container — add this to the world to display it */
	container: Container;
	/** Convex document _id, if persisted */
	objectId?: string;

	private background: Graphics;
	private textDisplay: Text;
	private blockWidth: number;
	private blockHeight: number;

	constructor(content: string, x: number, y: number, color: number = 0xfff9c4, options: TextBlockOptions = {}) {
		this.objectId = options.objectId;
		this.container = new Container();
		this.container.x = x;
		this.container.y = y;

		// Make this container interactive (needed for drag-and-drop)
		this.container.eventMode = 'static';
		this.container.cursor = 'grab';

		// Create the text first so we can measure it and size the background
		const style = new TextStyle({
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fontSize: 16,
			fill: 0x2d2d2d,
			wordWrap: true,
			wordWrapWidth: DEFAULT_WIDTH - PADDING * 2,
			lineHeight: 22
		});

		this.textDisplay = new Text({ text: content, style });
		this.textDisplay.x = PADDING;
		this.textDisplay.y = PADDING;

		// Size the background to fit the text
		this.blockWidth = DEFAULT_WIDTH;
		this.blockHeight = this.textDisplay.height + PADDING * 2;

		// Draw the rounded rectangle background
		this.background = new Graphics();
		this.drawBackground(color);

		// Add children in order: background first (behind), then text (in front)
		this.container.addChild(this.background);
		this.container.addChild(this.textDisplay);

		// Make this block draggable, with persistence and long-press callbacks
		makeDraggable(this.container, {
			onDragEnd: (finalX, finalY) => {
				if (this.objectId && options.onDragEnd) {
					options.onDragEnd(this.objectId, finalX, finalY);
				}
			},
			onDragMove: (x, y) => {
				if (this.objectId && options.onDragMove) {
					options.onDragMove(this.objectId, x, y);
				}
			},
			onLongPress: (screenX, screenY) => {
				if (this.objectId && options.onLongPress) {
					options.onLongPress(this.objectId, screenX, screenY);
				}
			},
		});
	}

	private drawBackground(color: number) {
		this.background.roundRect(0, 0, this.blockWidth, this.blockHeight, CORNER_RADIUS);
		this.background.fill(color);
	}
}
