import { Container, Graphics, HTMLText, HTMLTextStyle, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import { gsap } from '../gsapInit';
import { FONT_FAMILY } from '../textStyles';
import { makeDraggable, makeLongPressable, makeTappable, animateDragLift, animateDragDrop } from '../interactions/DragDrop';

/**
 * TextBlock — a sticky-note-style object on the canvas.
 *
 * Uses HTMLText to render rich-formatted content (bold, italic, headings, lists).
 * Plain text is valid HTML and renders identically — no migration needed.
 *
 * Supports free resize via 8 handle zones (4 corners + 4 edges).
 * Width clamped to MIN_WIDTH..MAX_WIDTH. Height minimum is text content height.
 * Left/top resize adjusts position to keep the opposite edge fixed.
 */

const PADDING = 16;
const CORNER_RADIUS = 12;
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const MIN_HEIGHT = 60;
const MAX_HEIGHT = 1200;
const HANDLE_SIZE = 16;

/** Resize zone half-width (extends inside AND outside the note edge) */
const EDGE_ZONE = 6;
/** Corner zone size */
const CORNER_ZONE = 14;

export interface TextBlockOptions {
	/** Convex document _id — links this visual to the database record */
	objectId?: string;
	/** Whether the current user can drag this object (default: true) */
	editable?: boolean;
	/** Whether to animate entrance (default: true) */
	animate?: boolean;
	/** Initial width from Convex (default: 240) */
	initialWidth?: number;
	/** Initial height from Convex (0 = auto-fit to text) */
	initialHeight?: number;
	/** Called when the user starts dragging this block (movement confirmed) */
	onDragStart?: (objectId: string) => void;
	/** Called when the user finishes dragging this block */
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	/** Called continuously during drag with intermediate positions */
	onDragMove?: (objectId: string, x: number, y: number) => void;
	/** Called on long-press (500ms hold) — triggers sticker picker */
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
	/** Called when the user taps (no drag) this block */
	onTap?: (objectId: string) => void;
	/** Called when the user finishes resizing — includes final position (left/top resize shifts it) */
	onResize?: (objectId: string, x: number, y: number, width: number, height: number) => void;
}

/**
 * Resize zone definition.
 * dirX/dirY encode which axes this handle controls:
 *   1 = right/bottom edge (size grows with pointer movement)
 *  -1 = left/top edge (size grows opposite to pointer, position shifts)
 *   0 = no change on this axis
 */
interface ResizeZone {
	graphics: Graphics;
	dirX: number;
	dirY: number;
}

export class TextBlock {
	/** The PixiJS container — add this to the world to display it */
	container: Container;
	/** Convex document _id, if persisted */
	objectId?: string;

	private background: Graphics;
	private titleDisplay: Text | null = null;
	private textDisplay: HTMLText;
	private blockWidth: number;
	private blockHeight: number;
	private currentColor: number = 0xfff9c4;
	private currentTitle: string = '';
	private options: TextBlockOptions;
	private style: HTMLTextStyle;
	/** Active color transition tween (killed before starting a new one) */
	private colorTween: gsap.core.Tween | null = null;
	/** Pending RAF ID for height check — cancelled on destroy to prevent callbacks on dead containers */
	private pendingRAF: number | null = null;

	/** User-set minimum height (0 = auto-fit to text only) */
	private userHeight = 0;
	/** Resize zone handles */
	private resizeZones: ResizeZone[] = [];

	/** Gap between title and body text */
	private static readonly TITLE_GAP = 4;

	/** Public getters for overlay positioning */
	get width(): number { return this.blockWidth; }
	get height(): number { return this.blockHeight; }

	constructor(content: string, x: number, y: number, color: number = 0xfff9c4, options: TextBlockOptions = {}, title: string = '') {
		this.objectId = options.objectId;
		this.options = options;
		this.container = new Container();
		this.container.x = x;
		this.container.y = y;

		// Set width from options BEFORE creating the style
		this.blockWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, options.initialWidth ?? DEFAULT_WIDTH));
		this.userHeight = options.initialHeight ?? 0;

		// Make this container interactive
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'grab' : 'default';

		// HTMLTextStyle with tagStyles for rich text rendering
		this.style = new HTMLTextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 16,
			fill: 0x2d2d2d,
			wordWrap: true,
			wordWrapWidth: this.blockWidth - PADDING * 2,
			lineHeight: 22,
			padding: 20,
			tagStyles: {
				h1: { fontSize: 24, fontWeight: 'bold' },
				h2: { fontSize: 20, fontWeight: 'bold' },
				h3: { fontSize: 18, fontWeight: 'bold' },
				strong: { fontWeight: 'bold' },
				em: { fontStyle: 'italic' },
			},
			cssOverrides: [
				'ul { padding-left: 20px; list-style-type: disc; }',
				'ol { padding-left: 20px; list-style-type: decimal; }',
				'li { margin-bottom: 2px; }',
				'p { margin: 2px 0; }',
			],
		});

		this.textDisplay = new HTMLText({ text: content, style: this.style });
		this.textDisplay.x = PADDING;
		this.textDisplay.y = PADDING;

		// Title display (plain PixiJS Text — synchronous measurement)
		this.currentTitle = title;
		if (title) {
			this.titleDisplay = new Text({
				text: title,
				style: new TextStyle({
					fontFamily: FONT_FAMILY,
					fontSize: 18,
					fontWeight: 'bold',
					fill: 0x2d2d2d,
					wordWrap: true,
					wordWrapWidth: this.blockWidth - PADDING * 2,
				}),
			});
			this.titleDisplay.x = PADDING;
			this.titleDisplay.y = PADDING;
			this.textDisplay.y = PADDING + this.titleDisplay.height + TextBlock.TITLE_GAP;
		}

		// Calculate height: max of text needs, user preference, and minimum
		this.blockHeight = 0; // placeholder — recalcBlockHeight sets real value
		this.recalcBlockHeight();

		// Draw the rounded rectangle background
		this.background = new Graphics();
		this.drawBackground(color);

		// Add children in order: background first (behind), then text (in front)
		this.container.addChild(this.background);
		if (this.titleDisplay) this.container.addChild(this.titleDisplay);
		this.container.addChild(this.textDisplay);

		// Add resize zones (owner-editable notes only)
		if (options.editable !== false) {
			this.createResizeZones();
		}

		// Owner: full drag + long-press. Visitor: long-press only (sticker reactions).
		if (options.editable !== false) {
			makeDraggable(this.container, {
				onDragStart: () => {
					this.animateDragLift();
					if (this.objectId && options.onDragStart) {
						options.onDragStart(this.objectId);
					}
				},
				onDragEnd: (finalX, finalY) => {
					this.animateDragDrop();
					if (this.objectId && options.onDragEnd) {
						options.onDragEnd(this.objectId, finalX, finalY);
					}
				},
				onDragMove: (moveX, moveY) => {
					if (this.objectId && options.onDragMove) {
						options.onDragMove(this.objectId, moveX, moveY);
					}
				},
				onLongPress: (screenX, screenY) => {
					if (this.objectId && options.onLongPress) {
						options.onLongPress(this.objectId, screenX, screenY);
					}
				},
			});
		} else if (options.onLongPress) {
			makeLongPressable(this.container, (screenX, screenY) => {
				if (this.objectId) options.onLongPress!(this.objectId, screenX, screenY);
			});
		}

		// Tap handler for viewing/editing note details (works for all users)
		if (options.onTap) {
			makeTappable(this.container, () => {
				if (this.objectId) options.onTap!(this.objectId);
			});
		}

		// HTMLText measures async — re-check height once layout settles
		this.scheduleHeightCheck();

		// Pop-in animation — note materializes with alpha + scale
		if (options.animate !== false) {
			this.container.scale.set(0);
			this.container.alpha = 0;
			gsap.to(this.container, { alpha: 1, duration: 0.15, ease: 'power2.out' });
			gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.45, ease: 'back.out(1.4)' });
		}
	}

	/** Update the displayed text and resize the background to fit */
	updateText(newText: string) {
		if (this.textDisplay.text === newText) return;
		this.textDisplay.text = newText;
		// Skip immediate redraw — scheduleHeightCheck() will recalc + redraw
		// over the next few frames as HTMLText measures asynchronously
		this.scheduleHeightCheck();
	}

	/** Update the background color with smooth transition */
	updateColor(color: number) {
		if (this.currentColor === color) return;
		// Kill previous color tween to prevent leak (#7)
		if (this.colorTween) {
			this.colorTween.kill();
			this.colorTween = null;
		}
		const fromColor = this.currentColor;
		this.currentColor = color; // Set target immediately so rapid calls don't start from stale color
		const proxy = { r: (fromColor >> 16) & 0xff, g: (fromColor >> 8) & 0xff, b: fromColor & 0xff };
		const toR = (color >> 16) & 0xff;
		const toG = (color >> 8) & 0xff;
		const toB = color & 0xff;
		this.colorTween = gsap.to(proxy, {
			r: toR, g: toG, b: toB,
			duration: 0.35,
			ease: 'power2.inOut',
			onUpdate: () => {
				const c = (Math.round(proxy.r) << 16) | (Math.round(proxy.g) << 8) | Math.round(proxy.b);
				this.background.clear();
				this.drawBackground(c);
			},
			onComplete: () => { this.colorTween = null; },
		});
	}

	/** Update the note title */
	updateTitle(title: string) {
		if (this.currentTitle === title) return;
		this.currentTitle = title;

		if (title) {
			if (!this.titleDisplay) {
				this.titleDisplay = new Text({
					text: title,
					style: new TextStyle({
						fontFamily: FONT_FAMILY,
						fontSize: 18,
						fontWeight: 'bold',
						fill: 0x2d2d2d,
						wordWrap: true,
						wordWrapWidth: this.blockWidth - PADDING * 2,
					}),
				});
				this.titleDisplay.x = PADDING;
				this.titleDisplay.y = PADDING;
				// Insert title between background and text
				const bgIndex = this.container.getChildIndex(this.background);
				this.container.addChildAt(this.titleDisplay, bgIndex + 1);
			} else {
				this.titleDisplay.text = title;
			}
			this.textDisplay.y = PADDING + this.titleDisplay.height + TextBlock.TITLE_GAP;
		} else if (this.titleDisplay) {
			this.container.removeChild(this.titleDisplay);
			this.titleDisplay.destroy();
			this.titleDisplay = null;
			this.textDisplay.y = PADDING;
		}

		this.recalcBlockHeight();
		this.background.clear();
		this.drawBackground(this.currentColor);
		this.updateResizeZones();
	}

	/** Update size from Convex sync (external data change) */
	updateSize(width: number, height: number) {
		const clampedW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
		if (clampedW === this.blockWidth && height === this.userHeight) return;
		const widthChanged = clampedW !== this.blockWidth;
		this.blockWidth = clampedW;
		this.userHeight = height;
		if (widthChanged) {
			this.style.wordWrapWidth = this.blockWidth - PADDING * 2;
			this.textDisplay.text = this.textDisplay.text; // force re-measure only when width changed
			if (this.titleDisplay) {
				(this.titleDisplay.style as TextStyle).wordWrapWidth = this.blockWidth - PADDING * 2;
				this.titleDisplay.text = this.titleDisplay.text; // force re-measure
			}
		}
		this.recalcBlockHeight();
		this.background.clear();
		this.drawBackground(this.currentColor);
		this.updateResizeZones();
		if (widthChanged) this.scheduleHeightCheck();
	}

	/** Height = max of text content + title, user preference, and absolute minimum */
	private recalcBlockHeight() {
		const titleHeight = this.titleDisplay ? this.titleDisplay.height + TextBlock.TITLE_GAP : 0;
		const textFitHeight = this.textDisplay.height + titleHeight + PADDING * 2;
		this.blockHeight = Math.max(MIN_HEIGHT, textFitHeight, this.userHeight);
	}

	/**
	 * HTMLText measures asynchronously (offscreen SVG foreignObject).
	 * Re-check height over several frames until the measurement settles.
	 * RAF ID is tracked so we can cancel on destroy (prevents callbacks on dead containers).
	 */
	private scheduleHeightCheck() {
		// Cancel any in-flight check before starting a new one
		if (this.pendingRAF !== null) {
			cancelAnimationFrame(this.pendingRAF);
			this.pendingRAF = null;
		}
		let remaining = 5;
		let lastHeight = -1;
		const check = () => {
			this.pendingRAF = null;
			if (!this.container.parent) return; // destroyed
			const titleHeight = this.titleDisplay ? this.titleDisplay.height + TextBlock.TITLE_GAP : 0;
			// Reposition body text below title (title may have re-measured after word wrap)
			this.textDisplay.y = PADDING + titleHeight;
			const textFitHeight = this.textDisplay.height + titleHeight + PADDING * 2;
			const needed = Math.max(MIN_HEIGHT, textFitHeight, this.userHeight);
			if (Math.abs(needed - this.blockHeight) > 1) {
				this.blockHeight = needed;
				this.background.clear();
				this.drawBackground(this.currentColor);
				this.updateResizeZones();
			}
			remaining--;
			// Exit early if height stabilized (same as last frame)
			if (needed === lastHeight) {
				// Final sync — ensure background matches even if height didn't change
				this.background.clear();
				this.drawBackground(this.currentColor);
				this.updateResizeZones();
				return;
			}
			lastHeight = needed;
			if (remaining > 0) {
				this.pendingRAF = requestAnimationFrame(check);
			}
		};
		this.pendingRAF = requestAnimationFrame(check);
	}

	private drawBackground(color: number) {
		this.currentColor = color;
		this.background.roundRect(0, 0, this.blockWidth, this.blockHeight, CORNER_RADIUS);
		this.background.fill(color);
	}

	// ── Resize zones (8 handles: 4 corners + 4 edges) ──────────────────

	/** Create all 8 invisible resize zones around the note */
	private createResizeZones() {
		const ZONE_DEFS: Array<{ cursor: string; dirX: number; dirY: number }> = [
			{ cursor: 'ns-resize',   dirX: 0,  dirY: -1 }, // N
			{ cursor: 'nesw-resize', dirX: 1,  dirY: -1 }, // NE
			{ cursor: 'ew-resize',   dirX: 1,  dirY: 0  }, // E
			{ cursor: 'nwse-resize', dirX: 1,  dirY: 1  }, // SE
			{ cursor: 'ns-resize',   dirX: 0,  dirY: 1  }, // S
			{ cursor: 'nesw-resize', dirX: -1, dirY: 1  }, // SW
			{ cursor: 'ew-resize',   dirX: -1, dirY: 0  }, // W
			{ cursor: 'nwse-resize', dirX: -1, dirY: -1 }, // NW
		];

		for (const def of ZONE_DEFS) {
			const g = new Graphics();
			g.eventMode = 'static';
			g.cursor = def.cursor;
			this.setupResizeHandler(g, def.dirX, def.dirY);
			this.container.addChild(g);
			this.resizeZones.push({ graphics: g, dirX: def.dirX, dirY: def.dirY });
		}

		this.updateResizeZones();
	}

	/** Reposition and redraw all resize zone hit areas based on current dimensions */
	private updateResizeZones() {
		const W = this.blockWidth;
		const H = this.blockHeight;
		const E = EDGE_ZONE;
		const C = CORNER_ZONE;

		for (const zone of this.resizeZones) {
			zone.graphics.clear();
			const { dirX, dirY } = zone;

			let rx: number, ry: number, rw: number, rh: number;

			if (dirX === 0 && dirY === -1) {
				// North edge
				rx = C; ry = -E; rw = W - C * 2; rh = E * 2;
			} else if (dirX === 1 && dirY === -1) {
				// Northeast corner
				rx = W - C; ry = -E; rw = C + E; rh = C + E;
			} else if (dirX === 1 && dirY === 0) {
				// East edge
				rx = W - E; ry = C; rw = E * 2; rh = H - C * 2;
			} else if (dirX === 1 && dirY === 1) {
				// Southeast corner
				rx = W - C; ry = H - C; rw = C + E; rh = C + E;
			} else if (dirX === 0 && dirY === 1) {
				// South edge
				rx = C; ry = H - E; rw = W - C * 2; rh = E * 2;
			} else if (dirX === -1 && dirY === 1) {
				// Southwest corner
				rx = -E; ry = H - C; rw = C + E; rh = C + E;
			} else if (dirX === -1 && dirY === 0) {
				// West edge
				rx = -E; ry = C; rw = E * 2; rh = H - C * 2;
			} else {
				// Northwest corner
				rx = -E; ry = -E; rw = C + E; rh = C + E;
			}

			// Invisible hit area
			zone.graphics.rect(rx, ry, rw, rh);
			zone.graphics.fill({ color: 0xffffff, alpha: 0.001 });

			// Draw visual grip lines on SE corner only
			if (dirX === 1 && dirY === 1) {
				const gx = W - HANDLE_SIZE - 4;
				const gy = H - HANDLE_SIZE - 4;
				for (let i = 0; i < 3; i++) {
					const offset = i * 4;
					zone.graphics.moveTo(gx + HANDLE_SIZE - offset, gy + HANDLE_SIZE);
					zone.graphics.lineTo(gx + HANDLE_SIZE, gy + HANDLE_SIZE - offset);
					zone.graphics.stroke({ width: 1.5, color: 0x999999, alpha: 0.5 });
				}
			}
		}
	}

	/**
	 * Set up unified pointer handler for a resize zone.
	 * dirX/dirY encode which axes and direction (see ResizeZone docs).
	 */
	private setupResizeHandler(handle: Graphics, dirX: number, dirY: number) {
		let isResizing = false;
		let startMouseX = 0;
		let startMouseY = 0;
		let startWidth = 0;
		let startHeight = 0;
		let startPosX = 0;
		let startPosY = 0;

		handle.on('pointerdown', (event: FederatedPointerEvent) => {
			event.stopPropagation(); // Prevents note drag AND canvas pan
			isResizing = true;
			startMouseX = event.globalX;
			startMouseY = event.globalY;
			startWidth = this.blockWidth;
			startHeight = this.blockHeight;
			startPosX = this.container.x;
			startPosY = this.container.y;
		});

		handle.on('globalpointermove', (event: FederatedPointerEvent) => {
			if (!isResizing) return;

			const scale = this.container.parent?.scale.x ?? 1;
			const mouseDx = (event.globalX - startMouseX) / scale;
			const mouseDy = (event.globalY - startMouseY) / scale;

			// Calculate new size based on direction
			let newWidth = dirX !== 0 ? startWidth + mouseDx * dirX : this.blockWidth;
			let newHeight = dirY !== 0 ? startHeight + mouseDy * dirY : this.blockHeight;

			// Clamp width
			newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

			// Clamp height
			newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight));

			// Adjust position for left/top resize (keep opposite edge fixed)
			if (dirX === -1) {
				this.container.x = startPosX + (startWidth - newWidth);
			}
			if (dirY === -1) {
				this.container.y = startPosY + (startHeight - newHeight);
			}

			this.applySizeInternal(newWidth, newHeight);
		});

		const endResize = () => {
			if (!isResizing) return;
			isResizing = false;
			if (this.objectId && this.options.onResize) {
				this.options.onResize(
					this.objectId,
					this.container.x,
					this.container.y,
					this.blockWidth,
					this.blockHeight,
				);
			}
		};

		handle.on('pointerup', endResize);
		handle.on('pointerupoutside', endResize);
	}

	/** Apply a new size during live resize (no Convex call, just visual) */
	private applySizeInternal(width: number, height: number) {
		const widthChanged = width !== this.blockWidth;
		this.blockWidth = width;
		this.userHeight = height;
		if (widthChanged) {
			this.style.wordWrapWidth = this.blockWidth - PADDING * 2;
			this.textDisplay.text = this.textDisplay.text; // force re-measure only when width changed
			if (this.titleDisplay) {
				(this.titleDisplay.style as TextStyle).wordWrapWidth = this.blockWidth - PADDING * 2;
				this.titleDisplay.text = this.titleDisplay.text;
			}
		}
		this.recalcBlockHeight();
		this.background.clear();
		this.drawBackground(this.currentColor);
		this.updateResizeZones();
	}

	// ── Drag animations (delegated to shared utilities) ─────────────────

	/** Random tilt delta added during drag lift */
	private liftRotation = 0;

	animateDragLift() {
		this.liftRotation = animateDragLift(this.container);
	}

	animateDragDrop() {
		animateDragDrop(this.container, this.liftRotation);
	}

	// ── Edit mode animations ────────────────────────────────────────────

	/** Brief lift before DOM overlay takes over — resolves when animation finishes */
	animateEditLift(): Promise<void> {
		// Kill any running drag/edit tweens to prevent conflicts (#8)
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.container);
		return new Promise((resolve) => {
			gsap.to(this.container.scale, {
				x: 1.04, y: 1.04,
				duration: 0.18,
				ease: 'power2.out',
				onComplete: () => {
					this.container.visible = false;
					resolve();
				},
			});
		});
	}

	/** Spring back to normal when editor closes */
	animateEditReturn() {
		// Kill any running lift tweens to prevent conflicts (#8)
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.container);
		this.container.visible = true;
		this.container.scale.set(1.04);
		this.container.alpha = 0.7;
		this.container.rotation = 0; // Reset any residual drag rotation
		gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
		gsap.to(this.container, { alpha: 1, duration: 0.2, ease: 'power2.out' });
	}

	/** Kill all running GSAP tweens and pending RAF on this object — call before removal */
	destroy() {
		if (this.pendingRAF !== null) {
			cancelAnimationFrame(this.pendingRAF);
			this.pendingRAF = null;
		}
		if (this.colorTween) {
			this.colorTween.kill();
			this.colorTween = null;
		}
		gsap.killTweensOf(this.container);
		gsap.killTweensOf(this.container.scale);
	}
}
