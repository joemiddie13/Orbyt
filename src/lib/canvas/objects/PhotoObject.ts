import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { gsap } from '../gsapInit';
import { FONT_FAMILY } from '../textStyles';
import { makeDraggable, makeLongPressable, makeTappable, makeHoverable, animateDragLift, animateDragDrop } from '../interactions/DragDrop';

/**
 * PhotoObject — a Polaroid-style photo on the canvas.
 *
 * Visual: white rectangular frame with thicker bottom (caption area),
 * drop shadow, slight random rotation, optional caption text.
 * Image loaded async via HTMLImageElement from Convex storage URL.
 *
 * Shows the full image at native aspect ratio (no cropping).
 * Frame adapts to the image dimensions once loaded.
 */

const FRAME_PADDING = 16;
const CAPTION_PAD_TOP = 8;
const CAPTION_PAD_BOTTOM = 12;
const MIN_BOTTOM_PADDING = 56;
const CORNER_RADIUS = 5;
const SHADOW_OFFSET = 5;
const MAX_IMAGE_WIDTH = 320;
const MAX_IMAGE_HEIGHT = 440;
const DEFAULT_IMAGE_WIDTH = 290;
const DEFAULT_IMAGE_HEIGHT = 290;

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
	onDragStart?: (objectId: string) => void;
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	onDragMove?: (objectId: string, x: number, y: number) => void;
	onTap?: (objectId: string) => void;
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
}

export class PhotoObject {
	container: Container;
	objectId?: string;

	private captionText: Text | null = null;
	private shadow: Graphics;
	private frame: Graphics;
	private placeholder: Graphics | null = null;
	private imageWidth = DEFAULT_IMAGE_WIDTH;
	private imageHeight = DEFAULT_IMAGE_HEIGHT;

	/** Base Polaroid tilt (radians) — drag wobble returns to this */
	private baseRotation: number;
	/** Random tilt delta added during drag lift */
	private liftRotation = 0;
	private cleanupHover: (() => void) | null = null;

	constructor(content: PhotoContent, x: number, y: number, options: PhotoObjectOptions = {}) {
		this.objectId = options.objectId;
		this.baseRotation = (content.rotation ?? 0) * (Math.PI / 180);

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'grab' : 'default';
		this.container.rotation = this.baseRotation;

		// Drop shadow
		this.shadow = new Graphics();
		this.container.addChild(this.shadow);

		// White Polaroid frame
		this.frame = new Graphics();
		this.container.addChild(this.frame);

		// Caption first (so drawFrame knows the caption height)
		if (content.caption) {
			this.addCaption(content.caption);
		}

		// Draw initial frame at default size
		this.drawFrame();

		// Gray placeholder while image loads
		this.placeholder = new Graphics();
		this.placeholder.rect(FRAME_PADDING, FRAME_PADDING, this.imageWidth, this.imageHeight);
		this.placeholder.fill(0xf0f0f0);
		this.container.addChild(this.placeholder);

		// Re-add caption on top of placeholder
		if (this.captionText) {
			this.container.addChild(this.captionText);
		}

		// Load image async — frame resizes to fit actual dimensions
		if (content.imageUrl) {
			this.loadImage(content.imageUrl);
		}

		// Owner: drag + long-press. Visitor: long-press only.
		if (options.editable !== false) {
			makeDraggable(this.container, {
				onDragStart: () => {
					this.animateDragLift();
					if (this.objectId && options.onDragStart) options.onDragStart(this.objectId);
				},
				onDragEnd: (fx, fy) => {
					this.animateDragDrop();
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
			makeTappable(this.container, () => {
				if (this.objectId) options.onTap!(this.objectId);
			});
		}

		// Hover expand
		this.cleanupHover = makeHoverable(this.container);

		// Pop-in animation
		if (options.animate !== false) {
			this.container.scale.set(0);
			gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.7)' });
		}
	}

	/** Draw/redraw the shadow and white frame to match current image + caption dimensions */
	private drawFrame() {
		const captionHeight = this.captionText ? this.captionText.height : 0;
		const bottomSpace = Math.max(MIN_BOTTOM_PADDING, CAPTION_PAD_TOP + captionHeight + CAPTION_PAD_BOTTOM);
		const frameWidth = this.imageWidth + FRAME_PADDING * 2;
		const frameHeight = this.imageHeight + FRAME_PADDING + bottomSpace;

		this.shadow.clear();
		this.shadow.roundRect(SHADOW_OFFSET, SHADOW_OFFSET, frameWidth, frameHeight, CORNER_RADIUS);
		this.shadow.fill({ color: 0x000000, alpha: 0.15 });

		this.frame.clear();
		this.frame.roundRect(0, 0, frameWidth, frameHeight, CORNER_RADIUS);
		this.frame.fill(0xffffff);
		this.frame.roundRect(0, 0, frameWidth, frameHeight, CORNER_RADIUS);
		this.frame.stroke({ width: 1, color: 0xe0e0e0 });
	}

	private async loadImage(url: string) {
		try {
			// Convex storage URLs lack file extensions, so PixiJS Assets
			// can't auto-detect format. Load via HTMLImageElement instead.
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.src = url;
			await img.decode();

			const texture = Texture.from(img);

			// Scale to fit within max bounds, preserving aspect ratio (no cropping)
			const scale = Math.min(MAX_IMAGE_WIDTH / texture.width, MAX_IMAGE_HEIGHT / texture.height);
			this.imageWidth = Math.round(texture.width * scale);
			this.imageHeight = Math.round(texture.height * scale);

			// Redraw frame to match actual image dimensions
			this.drawFrame();

			// Place the image inside the frame
			const sprite = new Sprite(texture);
			sprite.width = this.imageWidth;
			sprite.height = this.imageHeight;
			sprite.x = FRAME_PADDING;
			sprite.y = FRAME_PADDING;
			this.container.addChild(sprite);

			// Remove placeholder
			if (this.placeholder) {
				this.container.removeChild(this.placeholder);
				this.placeholder.destroy();
				this.placeholder = null;
			}

			// Reposition caption and redraw frame for new image + caption size
			if (this.captionText) {
				this.captionText.y = FRAME_PADDING + this.imageHeight + CAPTION_PAD_TOP;
				this.captionText.style.wordWrapWidth = this.imageWidth;
			}
			this.drawFrame();
		} catch (err) {
			console.error('Failed to load photo:', err);
		}
	}

	private addCaption(text: string) {
		const style = new TextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 18,
			fill: 0x333333,
			wordWrap: true,
			wordWrapWidth: this.imageWidth,
			align: 'center',
		});
		this.captionText = new Text({ text, style });
		this.captionText.x = FRAME_PADDING;
		this.captionText.y = FRAME_PADDING + this.imageHeight + CAPTION_PAD_TOP;
		this.container.addChild(this.captionText);
	}

	/** Update caption text (for reactive sync) */
	updateCaption(newCaption: string) {
		if (this.captionText) {
			this.captionText.text = newCaption;
			this.drawFrame(); // Redraw frame to fit new caption height
		} else if (newCaption) {
			this.addCaption(newCaption);
			this.drawFrame();
		}
	}

	// ── Drag animations (delegated to shared utilities) ─────────────────

	animateDragLift() {
		this.liftRotation = animateDragLift(this.container, this.baseRotation);
	}

	animateDragDrop() {
		animateDragDrop(this.container, this.liftRotation, this.baseRotation);
	}

	/** Kill all running GSAP tweens — call before removal */
	destroy() {
		this.cleanupHover?.();
		gsap.killTweensOf(this.container);
		gsap.killTweensOf(this.container.scale);
	}
}
