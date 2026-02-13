import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import * as TWEEN from '@tweenjs/tween.js';
import { PanZoom } from './interactions/PanZoom';
import { TextBlock } from './objects/TextBlock';
import { BeaconObject, type BeaconContent } from './objects/BeaconObject';
import { StickerReaction, type StickerData } from './objects/StickerReaction';

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

/** Shape of a canvas object from Convex */
export interface CanvasObjectData {
	_id: string;
	type: string;
	position: { x: number; y: number };
	size: { w: number; h: number };
	content: any;
	expiresAt?: number;
	creatorId?: string;
}

export class CanvasRenderer {
	app: Application;
	world: Container;
	private canvasWidth: number;
	private canvasHeight: number;
	private panZoom!: PanZoom;

	/** Map from Convex _id → visual object for reconciliation */
	private objects = new Map<string, TextBlock | BeaconObject>();

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

	/** Callback for when an object is dragged to a new position */
	onObjectMoved?: (objectId: string, x: number, y: number) => void;

	/** Callback for when an object is being dragged (intermediate positions) */
	onObjectDragging?: (objectId: string, x: number, y: number) => void;

	/** Callback for when a beacon is tapped */
	onBeaconTapped?: (objectId: string) => void;

	/** Callback for when a note is tapped */
	onNoteTapped?: (objectId: string) => void;

	/** Callback for long-press on any object (sticker picker) */
	onObjectLongPress?: (objectId: string, screenX: number, screenY: number) => void;

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
		this.app.stage.addChild(this.world);
		this.drawBounds();
		this.panZoom = new PanZoom(this.app, this.world, this.canvasWidth, this.canvasHeight);

		// Integrate tween.js into the PixiJS render loop + interpolation + cursor staleness
		this.app.ticker.add(() => {
			TWEEN.update();
			this.interpolateRemotes();
			this.updateCursorStaleness();
		});
	}

	/**
	 * Reconcile the visual objects on canvas with data from Convex.
	 * Adds new objects, updates moved ones, removes deleted ones.
	 */
	syncObjects(data: CanvasObjectData[]) {
		const incomingIds = new Set(data.map((d) => d._id));

		// Remove objects that no longer exist in the database
		for (const [id, obj] of this.objects) {
			if (!incomingIds.has(id)) {
				this.world.removeChild(obj.container);
				obj.container.destroy({ children: true });
				this.objects.delete(id);
			}
		}

		// Add or update objects
		for (const obj of data) {
			const existing = this.objects.get(obj._id);

			if (existing) {
				// Update position if it changed (e.g. from another tab)
				existing.container.x = obj.position.x;
				existing.container.y = obj.position.y;

				// Update text content and color for notes
				if (obj.type === 'textblock' && existing instanceof TextBlock) {
					existing.updateText(obj.content?.text ?? '');
					existing.updateColor(obj.content?.color ?? 0xfff9c4);
					existing.updateSize(obj.size?.w ?? 240, obj.size?.h ?? 0);
				}

				// Update expired state for beacons
				if (obj.type === 'beacon' && existing instanceof BeaconObject) {
					if (obj.expiresAt && obj.expiresAt < Date.now()) {
						existing.setExpired();
					}
				}
			} else if (obj.type === 'textblock') {
				const color = obj.content?.color ?? 0xfff9c4;
				const text = obj.content?.text ?? '';
				const block = new TextBlock(text, obj.position.x, obj.position.y, color, {
					objectId: obj._id,
					editable: this.editable,
					initialWidth: obj.size?.w ?? 240,
					initialHeight: obj.size?.h ?? 0,
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onDragMove: (id, x, y) => this.onObjectDragging?.(id, x, y),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
					onTap: (id) => this.onNoteTapped?.(id),
					onResize: (id, x, y, w, h) => this.onObjectResized?.(id, x, y, w, h),
				});
				this.world.addChild(block.container);
				this.objects.set(obj._id, block);
			} else if (obj.type === 'beacon') {
				const content = obj.content as BeaconContent;
				const isExpired = obj.expiresAt ? obj.expiresAt < Date.now() : false;
				const beacon = new BeaconObject(content, obj.position.x, obj.position.y, {
					objectId: obj._id,
					editable: this.editable,
					isExpired,
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onDragMove: (id, x, y) => this.onObjectDragging?.(id, x, y),
					onTap: (id) => this.onBeaconTapped?.(id),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
				});
				this.world.addChild(beacon.container);
				this.objects.set(obj._id, beacon);
			}
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
	getObject(objectId: string): TextBlock | BeaconObject | undefined {
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
			fontFamily: 'system-ui, -apple-system, sans-serif',
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

	/** Deterministic color for a userId */
	private getCursorColor(userId: string): number {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = (hash * 31 + userId.charCodeAt(i)) | 0;
		}
		return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
	}

	private drawBounds() {
		// Filled canvas area — stands out against the space background
		const fill = new Graphics();
		fill.roundRect(0, 0, this.canvasWidth, this.canvasHeight, 16);
		fill.fill(CANVAS_COLOR);
		fill.stroke({ width: 2, color: 0xc4b5a5 });
		this.world.addChild(fill);
	}

	destroy() {
		this.removeAllRemoteCursors();
		this.app.destroy(true, { children: true });
	}
}
