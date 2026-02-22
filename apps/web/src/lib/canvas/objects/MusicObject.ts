import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { gsap } from '../gsapInit';
import { FONT_FAMILY, CURSOR_POINTER } from '../textStyles';
import { makeDraggable, makeLongPressable, makeTappable, makeHoverable } from '../interactions/DragDrop';

/**
 * MusicObject — a dark rounded card on the canvas representing a music link.
 *
 * Layout (left → right): play button | album art | title + artist + platform
 * Tap toggles play/pause — equalizer bars animate when playing.
 */

// Card dimensions
const CARD_WIDTH = 400;
const CARD_HEIGHT = 135;
const CARD_RADIUS = 16;
const SHADOW_OFFSET = 4;

// Play button — far left
const PLAY_CX = 32;
const PLAY_CY = CARD_HEIGHT / 2;
const PLAY_RADIUS = 21;

// Album art — right of play button
const THUMB_LEFT = 64;
const THUMB_SIZE = 88;
const THUMB_RADIUS = 12;
const THUMB_CY = (CARD_HEIGHT - THUMB_SIZE) / 2;

// Text — right of album art
const TEXT_LEFT = THUMB_LEFT + THUMB_SIZE + 16;
const TEXT_MAX_W = CARD_WIDTH - TEXT_LEFT - 28;

// Platform badge
const BADGE_SIZE = 12;

// Equalizer bar geometry
const EQ_BAR_W = 5;
const EQ_BAR_GAP = 3;
const EQ_BAR_MAX_H = 22;
const EQ_BAR_COUNT = 3;

const PLATFORM_COLORS: Record<string, number> = {
	spotify: 0x1db954,
	youtube: 0xff0000,
	'youtube-music': 0xff0000,
	'apple-music': 0xfc3c44,
};

export interface MusicContent {
	url: string;
	platform: string;
	title: string;
	artist: string;
	thumbnailUrl?: string;
	embedUrl: string;
}

export interface MusicObjectOptions {
	objectId?: string;
	editable?: boolean;
	animate?: boolean;
	onDragStart?: (objectId: string) => void;
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	onDragMove?: (objectId: string, x: number, y: number) => void;
	onTap?: (objectId: string) => void;
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
	onDelete?: (objectId: string) => void;
}

export class MusicObject {
	container: Container;
	objectId?: string;

	private titleText: Text;
	private artistText: Text;
	private playBtn: Container;
	private eqContainer: Container;
	private eqBars: Graphics[] = [];
	private glowBg: Graphics;
	private playing = false;
	private platformColor: number;
	private cleanupHover: (() => void) | null = null;
	private dragCleanup: (() => void) | null = null;
	private longPressCleanup: (() => void) | null = null;

	constructor(content: MusicContent, x: number, y: number, options: MusicObjectOptions = {}) {
		this.objectId = options.objectId;
		this.platformColor = PLATFORM_COLORS[content.platform] ?? 0x888888;

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'grab' : 'pointer';

		// Platform-colored glow (behind shadow, visible only when playing)
		this.glowBg = new Graphics();
		this.glowBg.roundRect(-3, -3, CARD_WIDTH + 6, CARD_HEIGHT + 6, CARD_RADIUS + 3);
		this.glowBg.fill({ color: this.platformColor, alpha: 0.2 });
		this.glowBg.visible = false;
		this.container.addChild(this.glowBg);

		// Drop shadow
		const shadow = new Graphics();
		shadow.roundRect(SHADOW_OFFSET, SHADOW_OFFSET, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		shadow.fill({ color: 0x000000, alpha: 0.2 });
		this.container.addChild(shadow);

		// Dark card background
		const bg = new Graphics();
		bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		bg.fill(0x1a1a2e);
		bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		bg.stroke({ width: 1, color: 0x2a2a3e });
		this.container.addChild(bg);

		// ── Album art ──────────────────────────────────────────────────
		const thumbPlaceholder = new Graphics();
		thumbPlaceholder.roundRect(THUMB_LEFT, THUMB_CY, THUMB_SIZE, THUMB_SIZE, THUMB_RADIUS);
		thumbPlaceholder.fill(0x2a2a3e);
		this.container.addChild(thumbPlaceholder);

		if (content.thumbnailUrl) {
			this.loadThumbnail(content.thumbnailUrl, thumbPlaceholder);
		}

		// ── Platform badge (colored circle, top-right) ─────────────────
		const badge = new Graphics();
		badge.circle(CARD_WIDTH - 16, 16, BADGE_SIZE / 2);
		badge.fill(this.platformColor);
		this.container.addChild(badge);

		// ── Delete button (trash icon, top-right corner, owner only) ──
		if (options.editable !== false && options.onDelete) {
			const delBtn = new Container();
			delBtn.eventMode = 'static';
			delBtn.cursor = CURSOR_POINTER;

			// Center point of the button
			const cx = CARD_WIDTH - 14;
			const cy = 14;

			const delBg = new Graphics();
			delBg.circle(cx, cy, 12);
			delBg.fill({ color: 0x000000, alpha: 0.5 });
			delBtn.addChild(delBg);

			// Trash can icon drawn with Graphics
			const trash = new Graphics();
			// Lid
			trash.roundRect(cx - 6, cy - 6, 12, 2, 1);
			trash.fill(0xffffff);
			// Lid handle
			trash.roundRect(cx - 3, cy - 8, 6, 2.5, 1);
			trash.fill(0xffffff);
			// Body
			trash.moveTo(cx - 5, cy - 3);
			trash.lineTo(cx - 4, cy + 6);
			trash.lineTo(cx + 4, cy + 6);
			trash.lineTo(cx + 5, cy - 3);
			trash.closePath();
			trash.fill(0xffffff);
			// Body lines (cut out with dark color)
			trash.rect(cx - 2, cy - 1, 1, 5);
			trash.fill(0x000000);
			trash.rect(cx + 1, cy - 1, 1, 5);
			trash.fill(0x000000);
			delBtn.addChild(trash);

			delBtn.on('pointerdown', (e) => { e.stopPropagation(); });
			delBtn.on('pointerup', (e) => {
				e.stopPropagation();
				if (this.objectId) options.onDelete!(this.objectId);
			});
			this.container.addChild(delBtn);
		}

		// ── Title ──────────────────────────────────────────────────────
		const titleStyle = new TextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 24,
			fontWeight: 'bold',
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: TEXT_MAX_W,
		});
		this.titleText = new Text({ text: content.title || 'Unknown', style: titleStyle });
		this.titleText.x = TEXT_LEFT;
		this.titleText.y = 16;
		this.container.addChild(this.titleText);

		// ── Artist (positioned dynamically below title) ───────────────
		const artistStyle = new TextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 18,
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: TEXT_MAX_W,
		});
		this.artistText = new Text({ text: content.artist || '', style: artistStyle });
		this.artistText.x = TEXT_LEFT;
		this.artistText.y = this.titleText.y + this.titleText.height + 6;
		this.artistText.alpha = 0.6;
		this.container.addChild(this.artistText);

		// ── Platform label (positioned below artist) ──────────────────
		if (content.platform !== 'apple-music') {
			const PLATFORM_LABELS: Record<string, string> = {
				spotify: 'Spotify',
				youtube: 'YouTube',
				'youtube-music': 'YouTube Music',
			};
			const platformLabel = PLATFORM_LABELS[content.platform] ?? content.platform;
			const platformStyle = new TextStyle({
				fontFamily: FONT_FAMILY,
				fontSize: 14,
				fill: this.platformColor,
			});
			const platformText = new Text({ text: platformLabel, style: platformStyle });
			platformText.x = TEXT_LEFT;
			platformText.y = this.artistText.y + this.artistText.height + 6;
			platformText.alpha = 0.8;
			this.container.addChild(platformText);
		}

		// ── Play button (left of album art) ────────────────────────────
		this.playBtn = new Container();

		const playCircle = new Graphics();
		playCircle.circle(PLAY_CX, PLAY_CY, PLAY_RADIUS);
		playCircle.fill({ color: 0x000000, alpha: 0.45 });
		this.playBtn.addChild(playCircle);

		const playTriangle = new Graphics();
		playTriangle.moveTo(PLAY_CX - 7, PLAY_CY - 11);
		playTriangle.lineTo(PLAY_CX - 7, PLAY_CY + 11);
		playTriangle.lineTo(PLAY_CX + 10, PLAY_CY);
		playTriangle.closePath();
		playTriangle.fill(0xffffff);
		this.playBtn.addChild(playTriangle);

		this.container.addChild(this.playBtn);

		// ── Equalizer bars (visible when playing, same position as play btn) ──
		this.eqContainer = new Container();
		this.eqContainer.visible = false;

		const eqCircle = new Graphics();
		eqCircle.circle(PLAY_CX, PLAY_CY, PLAY_RADIUS);
		eqCircle.fill({ color: 0x000000, alpha: 0.45 });
		this.eqContainer.addChild(eqCircle);

		const totalW = EQ_BAR_COUNT * EQ_BAR_W + (EQ_BAR_COUNT - 1) * EQ_BAR_GAP;
		const eqStartX = PLAY_CX - totalW / 2;

		for (let i = 0; i < EQ_BAR_COUNT; i++) {
			const bar = new Graphics();
			bar.rect(0, 0, EQ_BAR_W, EQ_BAR_MAX_H);
			bar.fill(this.platformColor);
			bar.x = eqStartX + i * (EQ_BAR_W + EQ_BAR_GAP);
			bar.y = PLAY_CY + EQ_BAR_MAX_H / 2;
			bar.pivot.y = EQ_BAR_MAX_H;
			bar.scale.y = 0.3;
			this.eqBars.push(bar);
			this.eqContainer.addChild(bar);
		}

		this.container.addChild(this.eqContainer);

		// ── Interactions ────────────────────────────────────────────────
		if (options.editable !== false) {
			this.dragCleanup = makeDraggable(this.container, {
				onDragStart: () => {
					if (this.objectId && options.onDragStart) options.onDragStart(this.objectId);
				},
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
			this.longPressCleanup = makeLongPressable(this.container, (sx, sy) => {
				if (this.objectId) options.onLongPress!(this.objectId, sx, sy);
			});
		}

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

	/** Toggle the visual playing state — shows equalizer bars and glow */
	setPlaying(playing: boolean) {
		if (this.playing === playing) return;
		this.playing = playing;

		if (playing) {
			this.playBtn.visible = false;
			this.eqContainer.visible = true;
			this.glowBg.visible = true;

			gsap.fromTo(this.glowBg, { alpha: 0 }, { alpha: 1, duration: 0.3, ease: 'power2.out' });

			// Kill any existing EQ tweens first to prevent orphaned infinite-repeat tweens
			for (const bar of this.eqBars) {
				gsap.killTweensOf(bar.scale);
			}
			for (let i = 0; i < this.eqBars.length; i++) {
				gsap.to(this.eqBars[i].scale, {
					y: 'random(0.2, 1.0)',
					duration: 'random(0.25, 0.45)',
					ease: 'power1.inOut',
					repeat: -1,
					yoyo: true,
					delay: i * 0.08,
				});
			}
		} else {
			this.playBtn.visible = true;
			this.eqContainer.visible = false;
			this.glowBg.visible = false;

			for (const bar of this.eqBars) {
				gsap.killTweensOf(bar.scale);
				bar.scale.y = 0.3;
			}
			gsap.killTweensOf(this.glowBg);
		}
	}

	private async loadThumbnail(url: string, placeholder: Graphics) {
		try {
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.src = url;
			await img.decode();

			const texture = Texture.from(img);
			const sprite = new Sprite(texture);

			// Center-crop to square
			const scale = Math.max(THUMB_SIZE / texture.width, THUMB_SIZE / texture.height);
			sprite.width = texture.width * scale;
			sprite.height = texture.height * scale;
			sprite.x = THUMB_LEFT + (THUMB_SIZE - sprite.width) / 2;
			sprite.y = THUMB_CY + (THUMB_SIZE - sprite.height) / 2;

			// Rounded mask
			const mask = new Graphics();
			mask.roundRect(THUMB_LEFT, THUMB_CY, THUMB_SIZE, THUMB_SIZE, THUMB_RADIUS);
			mask.fill(0xffffff);
			this.container.addChild(mask);
			sprite.mask = mask;

			this.container.addChild(sprite);

			// Remove placeholder
			this.container.removeChild(placeholder);
			placeholder.destroy();
		} catch (err) {
			console.error('Failed to load music thumbnail:', err);
		}
	}

	/** Kill all running GSAP tweens — call before removal */
	destroy() {
		this.dragCleanup?.();
		this.longPressCleanup?.();
		this.cleanupHover?.();
		gsap.killTweensOf(this.container);
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.glowBg);
		for (const bar of this.eqBars) {
			gsap.killTweensOf(bar.scale);
		}
	}
}
