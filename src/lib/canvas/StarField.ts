/**
 * StarField — three-layer parallax star field behind the canvas.
 *
 * Added to `app.stage` (NOT world) so stars stay fixed relative to the
 * viewport. Each frame, layer offsets are computed from the world's
 * pan position, giving the illusion of depth.
 *
 * Layers:
 *   Far  — small dim stars, barely move (factor 0.02)
 *   Mid  — medium stars with GSAP twinkle (factor 0.06)
 *   Near — larger bright stars, most parallax (factor 0.15)
 */

import { Container, Graphics } from 'pixi.js';
import { gsap } from './gsapInit';

/** Warm-tinted star colors (80% warm, 20% cool) */
const WARM_COLORS = [0xFFF8E7, 0xFFE4B5, 0xFFD700, 0xFFF0D4, 0xFFCCCC];
const COOL_COLORS = [0xE8E8FF, 0xD4E4FF];

interface LayerConfig {
	count: number;
	minSize: number;
	maxSize: number;
	factor: number;
	minAlpha: number;
	maxAlpha: number;
}

const LAYERS: LayerConfig[] = [
	{ count: 120, minSize: 1, maxSize: 1.5, factor: 0.02, minAlpha: 0.3, maxAlpha: 0.6 },
	{ count: 70, minSize: 1.5, maxSize: 2.5, factor: 0.06, minAlpha: 0.4, maxAlpha: 0.8 },
	{ count: 35, minSize: 2, maxSize: 3.5, factor: 0.15, minAlpha: 0.5, maxAlpha: 1.0 },
];

/** Extra padding around viewport so stars cover parallax drift */
const FIELD_PADDING = 600;

export class StarField {
	private root: Container;
	private layers: Graphics[] = [];
	private layerConfigs: LayerConfig[] = LAYERS;
	private fieldWidth: number;
	private fieldHeight: number;
	/** Star positions (relative to field origin) per layer */
	private starData: Array<Array<{ rx: number; ry: number; size: number; color: number; alpha: number }>> = [];
	private twinkleTween: gsap.core.Tween | null = null;

	constructor(stage: Container) {
		this.root = new Container();
		// Insert at bottom of stage so world/canvas renders on top
		stage.addChildAt(this.root, 0);

		this.fieldWidth = window.innerWidth + FIELD_PADDING * 2;
		this.fieldHeight = window.innerHeight + FIELD_PADDING * 2;

		for (const config of this.layerConfigs) {
			const gfx = new Graphics();
			this.root.addChild(gfx);
			this.layers.push(gfx);
			this.starData.push(this.generateStars(config));
		}

		this.drawAllLayers();
		this.startTwinkle();
	}

	/** Generate random star positions for a layer */
	private generateStars(config: LayerConfig) {
		const stars: Array<{ rx: number; ry: number; size: number; color: number; alpha: number }> = [];
		for (let i = 0; i < config.count; i++) {
			const isWarm = Math.random() < 0.8;
			const palette = isWarm ? WARM_COLORS : COOL_COLORS;
			stars.push({
				rx: Math.random() * this.fieldWidth,
				ry: Math.random() * this.fieldHeight,
				size: config.minSize + Math.random() * (config.maxSize - config.minSize),
				color: palette[Math.floor(Math.random() * palette.length)],
				alpha: config.minAlpha + Math.random() * (config.maxAlpha - config.minAlpha),
			});
		}
		return stars;
	}

	/** Draw all stars into their Graphics objects */
	private drawAllLayers() {
		for (let i = 0; i < this.layers.length; i++) {
			const gfx = this.layers[i];
			const stars = this.starData[i];
			gfx.clear();
			for (const star of stars) {
				gfx.circle(star.rx, star.ry, star.size);
				gfx.fill({ color: star.color, alpha: star.alpha });
			}
		}
	}

	/** GSAP twinkle on the mid layer — alpha oscillates */
	private startTwinkle() {
		const midLayer = this.layers[1];
		if (!midLayer) return;
		this.twinkleTween = gsap.to(midLayer, {
			alpha: 0.7,
			duration: 3,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
		});
	}

	/** Called each frame from CanvasRenderer ticker */
	update(worldX: number, worldY: number) {
		for (let i = 0; i < this.layers.length; i++) {
			const factor = this.layerConfigs[i].factor;
			this.layers[i].x = -FIELD_PADDING + worldX * factor;
			this.layers[i].y = -FIELD_PADDING + worldY * factor;
		}
	}

	/** Handle window resize — regenerate star field */
	resize() {
		this.fieldWidth = window.innerWidth + FIELD_PADDING * 2;
		this.fieldHeight = window.innerHeight + FIELD_PADDING * 2;
		for (let i = 0; i < this.layerConfigs.length; i++) {
			this.starData[i] = this.generateStars(this.layerConfigs[i]);
		}
		this.drawAllLayers();
	}

	destroy() {
		if (this.twinkleTween) {
			this.twinkleTween.kill();
			this.twinkleTween = null;
		}
		gsap.killTweensOf(this.layers[1]);
		this.root.parent?.removeChild(this.root);
		this.root.destroy({ children: true });
	}
}
