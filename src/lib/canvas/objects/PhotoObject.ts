import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { gsap } from '../gsapInit';
import { makeDraggable, makeLongPressable } from '../interactions/DragDrop';

/**
 * PhotoObject — a Polaroid-style photo on the canvas.
 *
 * Visual: white rectangular frame with thicker bottom (caption area),
 * drop shadow, slight random rotation, optional caption text.
 * Image loaded async via PixiJS Assets.load() from Convex storage URL.
 */

const FRAME_PADDING = 12;
const BOTTOM_PADDING = 48;
const CORNER_RADIUS = 4;
const SHADOW_OFFSET = 4;
const IMAGE_SIZE = 236; // square image area (260 - 12*2)

export interface PhotoContent {
	storageId: string;
	imageUrl?: string | null;
	caption?: string;
	rotation: number;
}

export interface PhotoObjectOptions {
	objectId?: string;
	editable?: boolean;
	animate?: boolean;
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	onDragMove?: (objectId: string, x: number, y: number) => void;
	onTap?: (objectId: string) => void;
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
}

export class PhotoObject {
	container: Container;
	objectId?: string;
	private captionText: Text | null = null;

	constructor(content: PhotoContent, x: number, y: number, options: PhotoObjectOptions = {}) {
		this.objectId = options.objectId;

		const frameWidth = IMAGE_SIZE + FRAME_PADDING * 2;
		const frameHeight = IMAGE_SIZE + FRAME_PADDING + BOTTOM_PADDING;

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'grab' : 'default';

		// Apply random tilt (degrees → radians)
		this.container.rotation = (content.rotation ?? 0) * (Math.PI / 180);

		// Drop shadow
		const shadow = new Graphics();
		shadow.roundRect(SHADOW_OFFSET, SHADOW_OFFSET, frameWidth, frameHeight, CORNER_RADIUS);
		shadow.fill({ color: 0x000000, alpha: 0.15 });
		this.container.addChild(shadow);

		// White Polaroid frame
		const frame = new Graphics();
		frame.roundRect(0, 0, frameWidth, frameHeight, CORNER_RADIUS);
		frame.fill(0xffffff);
		frame.roundRect(0, 0, frameWidth, frameHeight, CORNER_RADIUS);
		frame.stroke({ width: 1, color: 0xe0e0e0 });
		this.container.addChild(frame);

		// Gray placeholder while image loads
		const placeholder = new Graphics();
		placeholder.rect(FRAME_PADDING, FRAME_PADDING, IMAGE_SIZE, IMAGE_SIZE);
		placeholder.fill(0xf0f0f0);
		this.container.addChild(placeholder);

		// Load image async
		if (content.imageUrl) {
			this.loadImage(content.imageUrl, placeholder);
		}

		// Caption
		if (content.caption) {
			this.addCaption(content.caption, frameWidth);
		}

		// Owner: drag + long-press. Visitor: long-press only.
		if (options.editable !== false) {
			makeDraggable(this.container, {
				onDragEnd: (fx, fy) => {
					if (this.objectId && options.onDragEnd) options.onDragEnd(this.objectId, fx, fy);
				},
				onDragMove: (mx, my) => {
					if (this.objectId && options.onDragMove) options.onDragMove(this.objectId, mx, my);
				},
				onLongPress: (sx, sy) => {
					if (this.objectId && options.onLongPress) options.onLongPress(this.objectId, sx, sy);
				},
			});
		} else if (options.onLongPress) {
			makeLongPressable(this.container, (sx, sy) => {
				if (this.objectId) options.onLongPress!(this.objectId, sx, sy);
			});
		}

		// Tap handler
		if (options.onTap) {
			let didMove = false;
			this.container.on('pointerdown', () => { didMove = false; });
			this.container.on('globalpointermove', () => { didMove = true; });
			this.container.on('pointerup', () => {
				if (!didMove && this.objectId) options.onTap!(this.objectId);
			});
		}

		// Pop-in animation
		if (options.animate !== false) {
			this.container.scale.set(0);
			gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.7)' });
		}
	}

	private async loadImage(url: string, placeholder: Graphics) {
		try {
			// Convex storage URLs lack file extensions, so PixiJS Assets
			// can't auto-detect format. Load via HTMLImageElement instead.
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.src = url;
			await img.decode();

			const texture = Texture.from(img);
			const sprite = new Sprite(texture);

			// Scale to cover the square area (center-crop)
			const scale = Math.max(IMAGE_SIZE / texture.width, IMAGE_SIZE / texture.height);
			sprite.width = texture.width * scale;
			sprite.height = texture.height * scale;

			// Center within the image area
			sprite.x = FRAME_PADDING + (IMAGE_SIZE - sprite.width) / 2;
			sprite.y = FRAME_PADDING + (IMAGE_SIZE - sprite.height) / 2;

			// Mask to clip to the image area
			const mask = new Graphics();
			mask.rect(FRAME_PADDING, FRAME_PADDING, IMAGE_SIZE, IMAGE_SIZE);
			mask.fill(0xffffff);
			this.container.addChild(mask);
			sprite.mask = mask;

			this.container.addChild(sprite);

			// Remove placeholder
			this.container.removeChild(placeholder);
			placeholder.destroy();
		} catch (err) {
			console.error('Failed to load photo:', err);
		}
	}

	private addCaption(text: string, frameWidth: number) {
		const style = new TextStyle({
			fontFamily: "'Caveat', 'Segoe Print', cursive, system-ui",
			fontSize: 14,
			fill: 0x333333,
			wordWrap: true,
			wordWrapWidth: frameWidth - FRAME_PADDING * 2,
			align: 'center',
		});
		this.captionText = new Text({ text, style });
		this.captionText.x = FRAME_PADDING;
		this.captionText.y = FRAME_PADDING + IMAGE_SIZE + 8;
		this.container.addChild(this.captionText);
	}

	/** Update caption text (for reactive sync) */
	updateCaption(newCaption: string) {
		if (this.captionText) {
			this.captionText.text = newCaption;
		} else if (newCaption) {
			this.addCaption(newCaption, IMAGE_SIZE + FRAME_PADDING * 2);
		}
	}
}
