import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { gsap } from '../gsapInit';
import { makeDraggable, makeLongPressable } from '../interactions/DragDrop';

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

const FRAME_PADDING = 12;
const BOTTOM_PADDING = 48;
const CORNER_RADIUS = 4;
const SHADOW_OFFSET = 4;
const MAX_IMAGE_WIDTH = 260;
const MAX_IMAGE_HEIGHT = 360;
const DEFAULT_IMAGE_WIDTH = 236;
const DEFAULT_IMAGE_HEIGHT = 236;

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

		// Draw initial frame at default size
		this.drawFrame();

		// Gray placeholder while image loads
		this.placeholder = new Graphics();
		this.placeholder.rect(FRAME_PADDING, FRAME_PADDING, this.imageWidth, this.imageHeight);
		this.placeholder.fill(0xf0f0f0);
		this.container.addChild(this.placeholder);

		// Load image async — frame resizes to fit actual dimensions
		if (content.imageUrl) {
			this.loadImage(content.imageUrl);
		}

		// Caption
		if (content.caption) {
			this.addCaption(content.caption);
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

	/** Draw/redraw the shadow and white frame to match current image dimensions */
	private drawFrame() {
		const frameWidth = this.imageWidth + FRAME_PADDING * 2;
		const frameHeight = this.imageHeight + FRAME_PADDING + BOTTOM_PADDING;

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

			// Reposition caption for new frame size
			if (this.captionText) {
				this.captionText.y = FRAME_PADDING + this.imageHeight + 8;
				this.captionText.style.wordWrapWidth = this.imageWidth;
			}
		} catch (err) {
			console.error('Failed to load photo:', err);
		}
	}

	private addCaption(text: string) {
		const style = new TextStyle({
			fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif",
			fontSize: 14,
			fill: 0x333333,
			wordWrap: true,
			wordWrapWidth: this.imageWidth,
			align: 'center',
		});
		this.captionText = new Text({ text, style });
		this.captionText.x = FRAME_PADDING;
		this.captionText.y = FRAME_PADDING + this.imageHeight + 8;
		this.container.addChild(this.captionText);
	}

	/** Update caption text (for reactive sync) */
	updateCaption(newCaption: string) {
		if (this.captionText) {
			this.captionText.text = newCaption;
		} else if (newCaption) {
			this.addCaption(newCaption);
		}
	}

	// ── Drag animations ─────────────────────────────────────────────────

	/** Lift photo off canvas — scale up + tilt away from base rotation */
	animateDragLift() {
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.container);

		this.liftRotation = (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.02);

		const tl = gsap.timeline();
		tl.to(this.container.scale, {
			x: 1.05, y: 1.05,
			duration: 0.2,
			ease: 'power2.out',
		}, 0);
		tl.to(this.container, {
			rotation: this.baseRotation + this.liftRotation,
			duration: 0.25,
			ease: 'power2.out',
		}, 0);
	}

	/** Drop photo back — squash-stretch impact + wobble settling to base rotation */
	animateDragDrop() {
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.container);

		const tl = gsap.timeline();

		// Squash on impact
		tl.to(this.container.scale, {
			x: 1.03, y: 0.97,
			duration: 0.1,
			ease: 'power2.in',
		});

		// Spring back to 1.0
		tl.to(this.container.scale, {
			x: 1, y: 1,
			duration: 0.3,
			ease: 'elastic.out(1, 0.4)',
		});

		// Wobble rotation back to base tilt
		tl.to(this.container, {
			rotation: this.baseRotation - this.liftRotation * 0.5,
			duration: 0.12,
			ease: 'power2.inOut',
		}, 0);
		tl.to(this.container, {
			rotation: this.baseRotation + this.liftRotation * 0.25,
			duration: 0.15,
			ease: 'sine.inOut',
		});
		tl.to(this.container, {
			rotation: this.baseRotation,
			duration: 0.2,
			ease: 'power2.out',
		});
	}

	/** Kill all running GSAP tweens — call before removal */
	destroy() {
		gsap.killTweensOf(this.container);
		gsap.killTweensOf(this.container.scale);
	}
}
