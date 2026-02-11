import { Application, Container, Graphics } from 'pixi.js';
import { PanZoom } from './interactions/PanZoom';
import { TextBlock } from './objects/TextBlock';

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
const BACKGROUND_COLOR = 0xf5f0eb;

/** Shape of a canvas object from Convex */
export interface CanvasObjectData {
	_id: string;
	type: string;
	position: { x: number; y: number };
	size: { w: number; h: number };
	content: any;
}

export class CanvasRenderer {
	app: Application;
	world: Container;
	private canvasWidth: number;
	private canvasHeight: number;
	private panZoom!: PanZoom;

	/** Map from Convex _id → TextBlock for reconciliation */
	private objects = new Map<string, TextBlock>();

	/** Callback for when an object is dragged to a new position */
	onObjectMoved?: (objectId: string, x: number, y: number) => void;

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
	}

	/**
	 * Reconcile the visual objects on canvas with data from Convex.
	 * Adds new objects, updates moved ones, removes deleted ones.
	 */
	syncObjects(data: CanvasObjectData[]) {
		const incomingIds = new Set(data.map((d) => d._id));

		// Remove objects that no longer exist in the database
		for (const [id, block] of this.objects) {
			if (!incomingIds.has(id)) {
				this.world.removeChild(block.container);
				block.container.destroy({ children: true });
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
			} else if (obj.type === "textblock") {
				// Create new TextBlock
				const color = obj.content?.color ?? 0xfff9c4;
				const text = obj.content?.text ?? "";
				const block = new TextBlock(text, obj.position.x, obj.position.y, color, {
					objectId: obj._id,
					onDragEnd: (id, x, y) => this.onObjectMoved?.(id, x, y),
				});
				this.world.addChild(block.container);
				this.objects.set(obj._id, block);
			}
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
		const border = new Graphics();
		border.rect(0, 0, this.canvasWidth, this.canvasHeight);
		border.stroke({ width: 2, color: 0xd4c5b5 });
		this.world.addChild(border);
	}

	destroy() {
		this.app.destroy(true, { children: true });
	}
}
