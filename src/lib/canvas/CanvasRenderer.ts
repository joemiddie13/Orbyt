import { Application, Container, Graphics, Rectangle, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import './gsapInit'; // Ensure GSAP + PixiPlugin registered before any object creation
import { gsap } from './gsapInit';
import { PanZoom } from './interactions/PanZoom';
import { StarField } from './StarField';
import { TextBlock } from './objects/TextBlock';
import { BeaconObject, type BeaconContent } from './objects/BeaconObject';
import { StickerReaction, type StickerData } from './objects/StickerReaction';
import { PhotoObject, type PhotoContent } from './objects/PhotoObject';

/**
 * CanvasRenderer — the core of Astrophage.
 *
 * Creates a PixiJS Application and mounts it to a DOM element. Everything
 * visible is rendered by PixiJS, not the browser's HTML/CSS engine.
 *
 * The "world" container is where all canvas objects live. Pan/zoom moves
 * the world container — not individual objects.
 */

const CANVAS_WIDTH = 3000;
const CANVAS_HEIGHT = 2000;
const BACKGROUND_COLOR = 0x0a0a1a; // Deep space
const CANVAS_COLOR = 0xe8e0d4; // Warm parchment, a few tints darker

/** Deterministic colors for remote cursors based on username hash */
const CURSOR_COLORS = [
	0x4FC3F7, 0xAED581, 0xFFB74D, 0xF06292, 0xBA68C8,
	0x4DB6AC, 0xFFD54F, 0xFF8A65, 0x7986CB, 0xA1887F,
];

const CURSOR_FADE_MS = 3000; // Fade out after 3s no update
const CURSOR_HIDE_MS = 5000; // Remove after 5s

/** Content shape for textblock objects */
export interface TextBlockContent {
	text: string;
	color: number;
	title?: string;
}

/** Base fields shared by all canvas objects */
interface CanvasObjectBase {
	_id: string;
	position: { x: number; y: number };
	size: { w: number; h: number };
	expiresAt?: number;
	creatorId?: string;
}

/** Discriminated union of all canvas object types from Convex */
export type CanvasObjectData =
	| (CanvasObjectBase & { type: "textblock"; content: TextBlockContent })
	| (CanvasObjectBase & { type: "beacon"; content: BeaconContent })
	| (CanvasObjectBase & { type: "photo"; content: PhotoContent });

export class CanvasRenderer {
	app: Application;
	world: Container;
	private canvasWidth: number;
	private canvasHeight: number;
	private panZoom!: PanZoom;
	private starField!: StarField;

	/** Map from Convex _id → visual object for reconciliation */
	private objects = new Map<string, TextBlock | BeaconObject | PhotoObject>();

	/** Map from sticker _id → StickerReaction */
	private stickers = new Map<string, StickerReaction>();

	/** Remote cursor visuals with interpolation targets */
	private remoteCursors = new Map<string, {
		container: Container;
		lastUpdate: number;
		targetX: number;
		targetY: number;
	}>();

	/** Remote object drag interpolation targets: objectId → { x, y } */
	private remoteObjectTargets = new Map<string, { x: number; y: number }>();

	/** Cache cursor colors by userId to avoid recomputing */
	private cursorColorCache = new Map<string, number>();

	/** Active stagger tweens — killed on canvas switch to prevent orphans (#9) */
	private activeStaggerTweens: gsap.core.Tween[] = [];

	/** Callback for when an object drag begins (movement confirmed) */
	onObjectDragStart?: (objectId: string) => void;

	/** Callback for when an object is dragged to a new position */
	onObjectMoved?: (objectId: string, x: number, y: number) => void;

	/** Callback for when an object is being dragged (intermediate positions) */
	onObjectDragging?: (objectId: string, x: number, y: number) => void;

	/** Callback for when a beacon is tapped */
	onBeaconTapped?: (objectId: string) => void;

	/** Callback for when a note is tapped */
	onNoteTapped?: (objectId: string) => void;

	/** Callback for when a photo is tapped */
	onPhotoTapped?: (objectId: string) => void;

	/** Callback for long-press on any object (sticker picker) */
	onObjectLongPress?: (objectId: string, screenX: number, screenY: number) => void;

	/** Callback for visitor sticker selection (inline emoji menu) */
	onStickerSelected?: (objectId: string, stickerType: string) => void;

	/** Callback for when an object is resized (includes final position for left/top resize) */
	onObjectResized?: (objectId: string, x: number, y: number, width: number, height: number) => void;

	/** Whether the current user can edit objects on this canvas */
	editable = true;

	constructor() {
		this.app = new Application();
		this.world = new Container();
		this.canvasWidth = CANVAS_WIDTH;
		this.canvasHeight = CANVAS_HEIGHT;
	}

	async init(container: HTMLElement) {
		await this.app.init({
			background: BACKGROUND_COLOR,
			resizeTo: window,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true
		});

		container.appendChild(this.app.canvas);
		this.starField = new StarField(this.app.stage);
		this.app.stage.addChild(this.world);
		this.drawBounds();
		this.panZoom = new PanZoom(this.app, this.world, this.canvasWidth, this.canvasHeight);

		// GSAP runs its own rAF loop — no manual update needed.
		// Ticker handles interpolation, cursor staleness, and star parallax.
		this.app.ticker.add(() => {
			this.starField.update(this.world.x, this.world.y);
			this.interpolateRemotes();
			this.updateCursorStaleness();
		});
	}

	/**
	 * Reconcile the visual objects on canvas with data from Convex.
	 * Adds new objects, updates moved ones, removes deleted ones.
	 *
	 * Bulk load detection: if the map is empty and multiple items arrive,
	 * individual pop-ins are suppressed in favor of a staggered entrance.
	 */
	syncObjects(data: CanvasObjectData[], animate = true) {
		const incomingIds = new Set(data.map((d) => d._id));
		const isBulkLoad = animate && this.objects.size === 0 && data.length > 1;

		// Kill any in-flight stagger tweens before reconciling (#9)
		for (const tween of this.activeStaggerTweens) {
			tween.kill();
		}
		this.activeStaggerTweens = [];

		// Remove objects that no longer exist in the database
		for (const [id, obj] of this.objects) {
			if (!incomingIds.has(id)) {
				if (obj instanceof BeaconObject) obj.destroy();
				if (obj instanceof TextBlock) obj.destroy();
				if (obj instanceof PhotoObject) obj.destroy();
				this.world.removeChild(obj.container);
				obj.container.destroy({ children: true });
				this.objects.delete(id);
			}
		}

		// Track newly created containers for stagger
		const newContainers: Container[] = [];

		// Add or update objects
		for (const obj of data) {
			const existing = this.objects.get(obj._id);

			if (existing) {
				// Update position if it changed (e.g. from another tab)
				if (existing.container.x !== obj.position.x) existing.container.x = obj.position.x;
				if (existing.container.y !== obj.position.y) existing.container.y = obj.position.y;

				// Update text content, color, and title for notes
				if (obj.type === 'textblock' && existing instanceof TextBlock) {
					existing.updateText(obj.content.text ?? '');
					existing.updateColor(obj.content.color ?? 0xfff9c4);
					existing.updateTitle(obj.content.title ?? '');
					existing.updateSize(obj.size.w ?? 240, obj.size.h ?? 0);
				}

				// Update expired state for beacons
				if (obj.type === 'beacon' && existing instanceof BeaconObject) {
					if (obj.expiresAt && obj.expiresAt < Date.now()) {
						existing.setExpired();
					}
				}

				// Update caption for photos
				if (obj.type === 'photo' && existing instanceof PhotoObject) {
					existing.updateCaption(obj.content.caption ?? '');
				}
			} else if (obj.type === 'textblock') {
				const { color = 0xfff9c4, text = '', title = '' } = obj.content;
				// Suppress individual pop-in during bulk load — stagger handles it
				const shouldAnimate = isBulkLoad ? false : animate;
				const block = new TextBlock(text, obj.position.x, obj.position.y, color, {
					objectId: obj._id,
					editable: this.editable,
					animate: shouldAnimate,
					initialWidth: obj.size.w ?? 240,
					initialHeight: obj.size.h ?? 0,
					onDragStart: (id) => this.onObjectDragStart?.(id),
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onDragMove: (id, x, y) => this.onObjectDragging?.(id, x, y),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
					onTap: (id) => this.onNoteTapped?.(id),
					onResize: (id, x, y, w, h) => this.onObjectResized?.(id, x, y, w, h),
				}, title);
				this.world.addChild(block.container);
				this.objects.set(obj._id, block);
				if (!this.editable) block.container.addChild(this.createStickerButton(obj._id, obj.size.w ?? 240));
				if (isBulkLoad) newContainers.push(block.container);
			} else if (obj.type === 'beacon') {
				const content = obj.content;
				const isExpired = obj.expiresAt ? obj.expiresAt < Date.now() : false;
				const shouldAnimate = isBulkLoad ? false : animate;
				const beacon = new BeaconObject(content, obj.position.x, obj.position.y, {
					objectId: obj._id,
					editable: this.editable,
					animate: shouldAnimate,
					isExpired,
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onDragMove: (id, x, y) => this.onObjectDragging?.(id, x, y),
					onTap: (id) => this.onBeaconTapped?.(id),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
				});
				this.world.addChild(beacon.container);
				this.objects.set(obj._id, beacon);
				if (!this.editable) beacon.container.addChild(this.createStickerButton(obj._id, obj.size.w ?? 200));
				if (isBulkLoad) newContainers.push(beacon.container);
			} else if (obj.type === 'photo') {
				const content = obj.content;
				const shouldAnimate = isBulkLoad ? false : animate;
				const photo = new PhotoObject(content, obj.position.x, obj.position.y, {
					objectId: obj._id,
					editable: this.editable,
					animate: shouldAnimate,
					onDragStart: (id) => this.onObjectDragStart?.(id),
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onDragMove: (id, x, y) => this.onObjectDragging?.(id, x, y),
					onTap: (id) => this.onPhotoTapped?.(id),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
				});
				this.world.addChild(photo.container);
				this.objects.set(obj._id, photo);
				if (!this.editable) photo.container.addChild(this.createStickerButton(obj._id, obj.size.w ?? 260));
				if (isBulkLoad) newContainers.push(photo.container);
			}
		}

		// Staggered entrance for bulk loads (canvas load / canvas switch)
		if (isBulkLoad && newContainers.length > 0) {
			this.staggerEntrance(newContainers);
		}
	}

	/**
	 * Sync sticker reactions — attach stickers to their parent objects.
	 */
	syncStickers(stickers: StickerData[]) {
		const incomingIds = new Set(stickers.map((s) => s._id));

		// Remove stickers that no longer exist
		for (const [id, sticker] of this.stickers) {
			if (!incomingIds.has(id)) {
				sticker.destroy();
				sticker.container.parent?.removeChild(sticker.container);
				sticker.container.destroy({ children: true });
				this.stickers.delete(id);
			}
		}

		// Add new stickers
		for (const stickerData of stickers) {
			if (this.stickers.has(stickerData._id)) continue;

			const parentObj = this.objects.get(stickerData.objectId);
			if (!parentObj) continue;

			const sticker = new StickerReaction(stickerData);
			parentObj.container.addChild(sticker.container);
			this.stickers.set(stickerData._id, sticker);
		}
	}

	/** Staggered entrance — objects cascade in with alpha + scale, 60ms apart */
	private staggerEntrance(containers: Container[]) {
		for (const c of containers) {
			c.scale.set(0);
			c.alpha = 0;
		}
		const scaleTween = gsap.to(containers.map((c) => c.scale), {
			x: 1, y: 1,
			duration: 0.45,
			ease: 'back.out(1.4)',
			stagger: 0.06,
			onComplete: () => this.removeStaggerTween(scaleTween),
		});
		const alphaTween = gsap.to(containers, {
			alpha: 1,
			duration: 0.25,
			ease: 'power2.out',
			stagger: 0.06,
			onComplete: () => this.removeStaggerTween(alphaTween),
		});
		this.activeStaggerTweens.push(scaleTween, alphaTween);
	}

	/** Remove a completed stagger tween from the active list */
	private removeStaggerTween(tween: gsap.core.Tween) {
		const idx = this.activeStaggerTweens.indexOf(tween);
		if (idx !== -1) this.activeStaggerTweens.splice(idx, 1);
	}

	/** Update beacon response dots */
	updateBeaconResponses(beaconId: string, responses: Array<{ status: string }>) {
		const obj = this.objects.get(beaconId);
		if (obj instanceof BeaconObject) {
			obj.updateResponseDots(responses);
		}
	}

	/** Get the center of the current viewport in world coordinates */
	getViewportCenter(): { x: number; y: number } {
		const screenCenterX = window.innerWidth / 2;
		const screenCenterY = window.innerHeight / 2;
		return {
			x: (screenCenterX - this.world.x) / this.world.scale.x,
			y: (screenCenterY - this.world.y) / this.world.scale.y,
		};
	}

	/** Convert screen coordinates to world coordinates */
	screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
		return {
			x: (screenX - this.world.x) / this.world.scale.x,
			y: (screenY - this.world.y) / this.world.scale.y,
		};
	}

	/** Convert world coordinates to screen coordinates (inverse of screenToWorld) */
	worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
		return {
			x: worldX * this.world.scale.x + this.world.x,
			y: worldY * this.world.scale.y + this.world.y,
		};
	}

	/** Lock pan/zoom (e.g. during inline editing) */
	lockPanZoom() {
		this.panZoom.lock();
	}

	/** Unlock pan/zoom */
	unlockPanZoom() {
		this.panZoom.unlock();
	}

	/** Get the current zoom scale */
	getScale(): number {
		return this.world.scale.x;
	}

	/** Get a canvas object by its Convex _id */
	getObject(objectId: string): TextBlock | BeaconObject | PhotoObject | undefined {
		return this.objects.get(objectId);
	}

	/** Show or update a remote user's cursor on the canvas */
	updateRemoteCursor(userId: string, username: string, worldX: number, worldY: number) {
		let entry = this.remoteCursors.get(userId);

		if (!entry) {
			const container = this.createCursorVisual(userId, username);
			container.x = worldX;
			container.y = worldY;
			this.world.addChild(container);
			entry = { container, lastUpdate: Date.now(), targetX: worldX, targetY: worldY };
			this.remoteCursors.set(userId, entry);
		}

		// Set interpolation target — ticker will lerp toward it
		entry.targetX = worldX;
		entry.targetY = worldY;
		entry.container.alpha = 1;
		entry.container.visible = true;
		entry.lastUpdate = Date.now();
	}

	/** Remove a remote cursor (e.g. peer disconnected) */
	removeRemoteCursor(userId: string) {
		const entry = this.remoteCursors.get(userId);
		if (entry) {
			this.world.removeChild(entry.container);
			entry.container.destroy({ children: true });
			this.remoteCursors.delete(userId);
		}
	}

	/** Remove all remote cursors (e.g. canvas switch) */
	removeAllRemoteCursors() {
		for (const [id] of this.remoteCursors) {
			this.removeRemoteCursor(id);
		}
	}

	/** Move an object's visual via WebRTC (no Convex, just preview) */
	moveObjectRemotely(objectId: string, x: number, y: number) {
		const obj = this.objects.get(objectId);
		if (!obj) return;
		// Set interpolation target — ticker will lerp toward it
		this.remoteObjectTargets.set(objectId, { x, y });
	}

	/** Stop interpolating an object (drag ended, Convex will set final position) */
	stopRemoteObjectInterpolation(objectId: string) {
		this.remoteObjectTargets.delete(objectId);
	}

	/** Play drag-lift animation on a remote object (WebRTC drag-start) */
	animateRemoteDragLift(objectId: string) {
		const obj = this.objects.get(objectId);
		if (obj instanceof TextBlock || obj instanceof PhotoObject) {
			obj.animateDragLift();
		}
	}

	/** Play drag-drop animation on a remote object (WebRTC drag-end) */
	animateRemoteDragDrop(objectId: string) {
		const obj = this.objects.get(objectId);
		if (obj instanceof TextBlock || obj instanceof PhotoObject) {
			obj.animateDragDrop();
		}
	}

	private createCursorVisual(userId: string, username: string): Container {
		const container = new Container();
		const color = this.getCursorColor(userId);

		// Arrow pointer
		const arrow = new Graphics();
		arrow.moveTo(0, 0);
		arrow.lineTo(0, 18);
		arrow.lineTo(5, 14);
		arrow.lineTo(10, 22);
		arrow.lineTo(13, 20);
		arrow.lineTo(8, 12);
		arrow.lineTo(14, 10);
		arrow.closePath();
		arrow.fill(color);
		arrow.stroke({ width: 1.5, color: 0xffffff });
		container.addChild(arrow);

		// Username label pill
		const style = new TextStyle({
			fontFamily: "'Satoshi', system-ui, -apple-system, sans-serif",
			fontSize: 11,
			fill: 0xffffff,
		});
		const label = new Text({ text: username, style });
		label.x = 16;
		label.y = 16;

		const pill = new Graphics();
		pill.roundRect(12, 13, label.width + 10, 18, 9);
		pill.fill({ color, alpha: 0.9 });
		container.addChild(pill);
		container.addChild(label);

		return container;
	}

	/** Lerp cursors and dragged objects toward their targets each frame */
	private interpolateRemotes() {
		if (this.remoteCursors.size === 0 && this.remoteObjectTargets.size === 0) return;
		const LERP = 0.3; // 0 = no movement, 1 = snap. 0.3 = smooth catch-up

		// Interpolate remote cursors
		for (const entry of this.remoteCursors.values()) {
			const dx = entry.targetX - entry.container.x;
			const dy = entry.targetY - entry.container.y;
			// Snap if close enough to avoid endless micro-lerps
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
				entry.container.x = entry.targetX;
				entry.container.y = entry.targetY;
			} else {
				entry.container.x += dx * LERP;
				entry.container.y += dy * LERP;
			}
		}

		// Interpolate remotely-dragged objects
		for (const [objectId, target] of this.remoteObjectTargets) {
			const obj = this.objects.get(objectId);
			if (!obj) {
				this.remoteObjectTargets.delete(objectId);
				continue;
			}
			const dx = target.x - obj.container.x;
			const dy = target.y - obj.container.y;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
				obj.container.x = target.x;
				obj.container.y = target.y;
			} else {
				obj.container.x += dx * LERP;
				obj.container.y += dy * LERP;
			}
		}
	}

	/** Fade/hide stale cursors in the render loop */
	private updateCursorStaleness() {
		if (this.remoteCursors.size === 0) return;
		const now = Date.now();
		for (const [userId, entry] of this.remoteCursors) {
			const age = now - entry.lastUpdate;
			if (age > CURSOR_HIDE_MS) {
				entry.container.visible = false;
			} else if (age > CURSOR_FADE_MS) {
				// Fade from 1.0 to 0.0 over the fade→hide window
				const fadeProgress = (age - CURSOR_FADE_MS) / (CURSOR_HIDE_MS - CURSOR_FADE_MS);
				entry.container.alpha = 1 - fadeProgress;
			}
		}
	}

	/** Deterministic color for a userId (cached) */
	private getCursorColor(userId: string): number {
		let color = this.cursorColorCache.get(userId);
		if (color !== undefined) return color;
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = (hash * 31 + userId.charCodeAt(i)) | 0;
		}
		color = CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
		this.cursorColorCache.set(userId, color);
		return color;
	}

	private drawBounds() {
		// Outer warm glow halo — ambient campfire light
		const outerGlow = new Graphics();
		outerGlow.roundRect(-20, -20, this.canvasWidth + 40, this.canvasHeight + 40, 28);
		outerGlow.fill({ color: 0xF59E0B, alpha: 0.04 });
		this.world.addChild(outerGlow);

		// Inner warm glow
		const innerGlow = new Graphics();
		innerGlow.roundRect(-10, -10, this.canvasWidth + 20, this.canvasHeight + 20, 22);
		innerGlow.fill({ color: 0xF59E0B, alpha: 0.06 });
		this.world.addChild(innerGlow);

		// Filled canvas area — warm parchment surface
		const fill = new Graphics();
		fill.roundRect(0, 0, this.canvasWidth, this.canvasHeight, 16);
		fill.fill(CANVAS_COLOR);
		fill.stroke({ width: 1.5, color: 0xBFA98A, alpha: 0.6 });
		this.world.addChild(fill);

		// Subtle breathing animation on outer glow
		gsap.to(outerGlow, {
			alpha: 0.07,
			duration: 4,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
		});
	}

	/**
	 * Create an inline sticker reaction menu for visitor-mode objects.
	 * Amber trigger circle with smiley — hover to fan out emoji options.
	 */
	private createStickerButton(objectId: string, objectWidth: number): Container {
		const STICKERS = [
			{ type: 'heart', emoji: '\u2764\uFE0F' },
			{ type: 'fire', emoji: '\uD83D\uDD25' },
			{ type: 'laugh', emoji: '\uD83D\uDE02' },
			{ type: 'wave', emoji: '\uD83D\uDC4B' },
			{ type: 'star', emoji: '\u2B50' },
			{ type: '100', emoji: '\uD83D\uDCAF' },
			{ type: 'thumbs-up', emoji: '\uD83D\uDC4D' },
			{ type: 'eyes', emoji: '\uD83D\uDC40' },
		];

		const SIZE = 30;
		const HALF = SIZE / 2;
		const SLOT = 34;        // width per emoji slot
		const PAD = 10;         // padding inside menu bar ends
		const MENU_GAP = 4;     // gap between trigger circle and menu bar

		const BAR_W = PAD * 2 + STICKERS.length * SLOT;  // total bar width
		const BAR_H = SLOT;                                // bar height
		const BAR_R = BAR_H / 2;                           // fully rounded pill ends

		type Dir = 'left' | 'right' | 'up' | 'down';
		const DIRS: Dir[] = ['left', 'right', 'up', 'down'];

		// Emoji target position for a given direction
		function emojiTarget(i: number, dir: Dir) {
			const offset = MENU_GAP + PAD + SLOT * (i + 0.5);
			switch (dir) {
				case 'left':  return { x: -offset, y: 0 };
				case 'right': return { x: offset, y: 0 };
				case 'up':    return { x: 0, y: -offset };
				case 'down':  return { x: 0, y: offset };
			}
		}

		// Hit area that covers trigger + expanded menu for a direction
		function dirHitArea(dir: Dir) {
			const reach = BAR_W + MENU_GAP;
			switch (dir) {
				case 'left':
					return new Rectangle(-reach - 4, -BAR_H / 2 - 4, reach + HALF + 8, BAR_H + 8);
				case 'right':
					return new Rectangle(-HALF - 4, -BAR_H / 2 - 4, reach + HALF + 8, BAR_H + 8);
				case 'up':
					return new Rectangle(-BAR_H / 2 - 4, -reach - 4, BAR_H + 8, reach + HALF + 8);
				case 'down':
					return new Rectangle(-BAR_H / 2 - 4, -HALF - 4, BAR_H + 8, reach + HALF + 8);
			}
		}

		// Redraw menu bar graphics for a direction
		function drawBar(dir: Dir) {
			menuBar.clear();
			const isH = dir === 'left' || dir === 'right';
			const sign = (dir === 'left' || dir === 'up') ? -1 : 1;
			if (isH) {
				const rx = sign > 0 ? 0 : -BAR_W;
				menuBar.roundRect(rx, -BAR_H / 2, BAR_W, BAR_H, BAR_R);
				menuBar.fill({ color: 0x0f0e1a, alpha: 0.82 });
				menuBar.roundRect(rx, -BAR_H / 2, BAR_W, BAR_H, BAR_R);
				menuBar.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
				menuBar.x = sign * MENU_GAP;
				menuBar.y = 0;
			} else {
				const ry = sign > 0 ? 0 : -BAR_W;
				menuBar.roundRect(-BAR_H / 2, ry, BAR_H, BAR_W, BAR_R);
				menuBar.fill({ color: 0x0f0e1a, alpha: 0.82 });
				menuBar.roundRect(-BAR_H / 2, ry, BAR_H, BAR_W, BAR_R);
				menuBar.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
				menuBar.x = 0;
				menuBar.y = sign * MENU_GAP;
			}
		}

		// Hit areas: collapsed (trigger only)
		const TRIGGER_HIT = new Rectangle(-HALF - 4, -HALF - 4, SIZE + 8, SIZE + 8);

		const btn = new Container();
		btn.eventMode = 'static';
		btn.cursor = 'pointer';
		btn.hitArea = TRIGGER_HIT;

		// Position at top-right corner of object
		btn.x = objectWidth - 2;
		btn.y = -4;

		let expanded = false;
		let expandTl: gsap.core.Timeline | null = null;

		// ── Trigger circle ──────────────────────────────────────────────

		const triggerShadow = new Graphics();
		triggerShadow.circle(1, 2, HALF);
		triggerShadow.fill({ color: 0x000000, alpha: 0.2 });
		btn.addChild(triggerShadow);

		const triggerBg = new Graphics();
		triggerBg.circle(0, 0, HALF);
		triggerBg.fill(0xfbbf24);
		triggerBg.circle(0, 0, HALF);
		triggerBg.stroke({ width: 1.5, color: 0xf59e0b });
		btn.addChild(triggerBg);

		const triggerEmoji = new Text({
			text: '\uD83D\uDC40',
			style: new TextStyle({ fontSize: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }),
		});
		triggerEmoji.anchor.set(0.5, 0.5);
		triggerEmoji.y = -1;
		btn.addChild(triggerEmoji);

		// ── Emoji option circles ────────────────────────────────────────

		const options: Container[] = [];

		// Glass menu background bar (redrawn per direction on expand)
		const menuBar = new Graphics();
		menuBar.alpha = 0;
		btn.addChildAt(menuBar, 0);

		let currentDir: Dir = 'left';

		for (let i = 0; i < STICKERS.length; i++) {
			const sticker = STICKERS[i];
			const opt = new Container();
			opt.eventMode = 'static';
			opt.cursor = 'pointer';
			// Start at trigger position (x=0), will animate to final position
			opt.x = 0;
			opt.y = 0;
			opt.alpha = 0;
			opt.scale.set(0);

			const optEmoji = new Text({
				text: sticker.emoji,
				style: new TextStyle({ fontSize: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }),
			});
			optEmoji.anchor.set(0.5, 0.5);
			optEmoji.y = -1;
			opt.addChild(optEmoji);

			// Hover: scale bounce on individual emoji
			opt.on('pointerover', () => {
				gsap.to(opt.scale, { x: 1.3, y: 1.3, duration: 0.15, ease: 'back.out(2)' });
			});
			opt.on('pointerout', () => {
				gsap.to(opt.scale, { x: 1, y: 1, duration: 0.12, ease: 'power2.out' });
			});

			// Click to select sticker
			opt.on('pointerdown', (e: FederatedPointerEvent) => {
				e.stopPropagation();
				// Bounce feedback
				gsap.to(opt.scale, {
					x: 1.6, y: 1.6, duration: 0.1, ease: 'power2.out',
					onComplete: () => {
						gsap.to(opt.scale, { x: 1, y: 1, duration: 0.2, ease: 'elastic.out(1, 0.5)' });
					},
				});
				this.onStickerSelected?.(objectId, sticker.type);
				// Collapse after a short delay for the bounce to play
				setTimeout(() => collapse(), 200);
			});

			btn.addChild(opt);
			options.push(opt);
		}

		// ── Expand / collapse ───────────────────────────────────────────

		function expand() {
			if (expanded) return;
			expanded = true;

			// Pick a random direction each time
			currentDir = DIRS[Math.floor(Math.random() * DIRS.length)];
			const isH = currentDir === 'left' || currentDir === 'right';

			// Redraw bar for this direction and set initial scale
			drawBar(currentDir);
			menuBar.alpha = 0;
			if (isH) {
				menuBar.scale.set(0, 1);
			} else {
				menuBar.scale.set(1, 0);
			}

			btn.hitArea = dirHitArea(currentDir);

			if (expandTl) expandTl.kill();
			expandTl = gsap.timeline();

			// Trigger: gentle pulse
			expandTl.to(triggerBg, { alpha: 0.7, duration: 0.15 }, 0);

			// Menu bar slides out
			expandTl.to(menuBar, { alpha: 1, duration: 0.2, ease: 'power2.out' }, 0);
			if (isH) {
				expandTl.to(menuBar.scale, { x: 1, duration: 0.25, ease: 'power2.out' }, 0);
			} else {
				expandTl.to(menuBar.scale, { y: 1, duration: 0.25, ease: 'power2.out' }, 0);
			}

			// Emoji options slide out with stagger
			options.forEach((opt, i) => {
				const pos = emojiTarget(i, currentDir);
				expandTl!.to(opt, {
					x: pos.x, y: pos.y, alpha: 1, duration: 0.25, ease: 'back.out(1.4)',
				}, 0.03 * i);
				expandTl!.to(opt.scale, {
					x: 1, y: 1, duration: 0.2, ease: 'back.out(2)',
				}, 0.03 * i + 0.02);
			});
		}

		function collapse() {
			if (!expanded) return;
			expanded = false;
			const isH = currentDir === 'left' || currentDir === 'right';

			if (expandTl) expandTl.kill();
			expandTl = gsap.timeline({
				onComplete: () => { btn.hitArea = TRIGGER_HIT; },
			});

			// Trigger: restore
			expandTl.to(triggerBg, { alpha: 1, duration: 0.15 }, 0);

			// Emojis slide back (reverse stagger — outermost first)
			options.forEach((opt, i) => {
				const delay = 0.02 * (options.length - 1 - i);
				expandTl!.to(opt, {
					x: 0, y: 0, alpha: 0, duration: 0.18, ease: 'power2.in',
				}, delay);
				expandTl!.to(opt.scale, {
					x: 0, y: 0, duration: 0.15, ease: 'power2.in',
				}, delay);
			});

			// Menu bar collapses after emojis
			expandTl.to(menuBar, { alpha: 0, duration: 0.15, ease: 'power2.in' }, 0.1);
			if (isH) {
				expandTl.to(menuBar.scale, { x: 0, duration: 0.2, ease: 'power2.in' }, 0.08);
			} else {
				expandTl.to(menuBar.scale, { y: 0, duration: 0.2, ease: 'power2.in' }, 0.08);
			}
		}

		// ── Events ──────────────────────────────────────────────────────

		btn.on('pointerover', () => expand());
		btn.on('pointerout', () => collapse());

		// Prevent parent object handlers from firing when interacting with menu
		btn.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
		});

		// Pop-in entrance for the trigger
		btn.scale.set(0);
		gsap.to(btn.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)', delay: 0.4 });

		return btn;
	}

	destroy() {
		this.removeAllRemoteCursors();
		this.panZoom.destroy();
		this.starField.destroy();
		this.app.destroy(true, { children: true });
	}
}
