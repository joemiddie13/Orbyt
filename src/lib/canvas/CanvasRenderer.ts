import { Application, Container, Graphics } from 'pixi.js';
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

	/** Callback for when an object is dragged to a new position */
	onObjectMoved?: (objectId: string, x: number, y: number) => void;

	/** Callback for when a beacon is tapped */
	onBeaconTapped?: (objectId: string) => void;

	/** Callback for long-press on any object (sticker picker) */
	onObjectLongPress?: (objectId: string, screenX: number, screenY: number) => void;

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

		// Integrate tween.js into the PixiJS render loop
		this.app.ticker.add(() => {
			TWEEN.update();
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
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
					onLongPress: (id, sx, sy) => this.onObjectLongPress?.(id, sx, sy),
				});
				this.world.addChild(block.container);
				this.objects.set(obj._id, block);
			} else if (obj.type === 'beacon') {
				const content = obj.content as BeaconContent;
				const isExpired = obj.expiresAt ? obj.expiresAt < Date.now() : false;
				const beacon = new BeaconObject(content, obj.position.x, obj.position.y, {
					objectId: obj._id,
					isExpired,
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
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

	private drawBounds() {
		// Filled canvas area — stands out against the space background
		const fill = new Graphics();
		fill.roundRect(0, 0, this.canvasWidth, this.canvasHeight, 16);
		fill.fill(CANVAS_COLOR);
		fill.stroke({ width: 2, color: 0xc4b5a5 });
		this.world.addChild(fill);
	}

	destroy() {
		this.app.destroy(true, { children: true });
	}
}
