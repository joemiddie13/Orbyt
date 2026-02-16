import { Container, Graphics, Rectangle, Sprite, Text, Texture, TextStyle } from 'pixi.js';
import { gsap } from '../gsapInit';
import { FONT_FAMILY, CURSOR_POINTER } from '../textStyles';
import { makeDraggable, makeLongPressable, makeTappable, makeHoverable } from '../interactions/DragDrop';

/**
 * BeaconObject — a living broadcast signal on the canvas.
 *
 * The card face uses a halftone dot display inspired by ASCII/dither art:
 * a grid of circles whose SIZE varies with signal wave intensity — big dots
 * where the signal is strong, tiny specks where it's quiet. Concentric waves
 * radiate outward from center, creating a living halftone animation.
 * Around the card: ripple emanation, cascading heartbeat pulse, signal dot
 * antenna, and layered ambient glow. Expired beacons dim and go silent.
 */

const BEACON_WIDTH = 320;
const BEACON_PADDING = 20;
const CORNER_RADIUS = 18;
const BEACON_COLOR = 0xFFA726;
const DIRECT_BEACON_COLOR = 0x26A69A;

// --- Living beacon animation constants ---
const RIPPLE_SPAWN_MS = 2800;
const RIPPLE_DURATION = 3.5;
const RIPPLE_MAX_SCALE = 4.5;
const RIPPLE_MAX_ALIVE = 3;
const HEARTBEAT_REPEAT_DELAY = 1.8;

// Halftone display — sprites whose SCALE varies with signal intensity
const HALFTONE_CELL = 26;
const HALFTONE_TEX_SIZE = 36;

/** Shared white circle texture — created once, used by all beacon dot sprites */
let _circleTexture: Texture | null = null;
function getCircleTexture(): Texture {
	if (!_circleTexture) {
		const c = document.createElement('canvas');
		c.width = HALFTONE_TEX_SIZE;
		c.height = HALFTONE_TEX_SIZE;
		const ctx = c.getContext('2d')!;
		ctx.beginPath();
		ctx.arc(HALFTONE_TEX_SIZE / 2, HALFTONE_TEX_SIZE / 2, HALFTONE_TEX_SIZE / 2 - 1, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		_circleTexture = Texture.from(c);
	}
	return _circleTexture;
}

export interface BeaconContent {
	title: string;
	description?: string;
	locationAddress?: string;
	startTime: number;
	endTime: number;
	visibilityType: 'direct' | 'canvas';
	directRecipients?: string[];
	directBeaconGroupId?: string;
	fromUsername?: string;
}

export interface BeaconObjectOptions {
	objectId?: string;
	/** Whether the current user can drag this object (default: true) */
	editable?: boolean;
	animate?: boolean;
	onDragEnd?: (objectId: string, x: number, y: number) => void;
	onDragMove?: (objectId: string, x: number, y: number) => void;
	onTap?: (objectId: string) => void;
	onLongPress?: (objectId: string, screenX: number, screenY: number) => void;
	onDelete?: (objectId: string) => void;
	isExpired?: boolean;
	isDirect?: boolean;
}

export class BeaconObject {
	container: Container;
	objectId?: string;

	// Visual layers
	private rippleLayer: Container;
	private ambientGlow: Graphics;
	private outerGlow: Graphics;
	private glowRing: Graphics;
	private cardBg: Graphics;
	private signalDot: Graphics;

	// Halftone animation (sprite-based — no geometry rebuild per frame)
	private halftoneContainer: Container | null = null;
	private halftoneDots: { sprite: Sprite; dist: number }[] = [];
	private halftoneTime: number = 0;
	private halftoneFrame: number = 0;
	private animTick: (() => void) | null = null;

	// Animation state
	private pulseTl: gsap.core.Timeline | null = null;
	private rippleInterval: ReturnType<typeof setInterval> | null = null;
	private activeRipples: { graphics: Graphics; tweens: gsap.core.Tween[] }[] = [];
	private isExpired: boolean;
	private baseColor: number;
	private cardHeight: number;

	// Response dots
	private responseDots: Graphics | null = null;
	private cleanupHover: (() => void) | null = null;

	constructor(content: BeaconContent, x: number, y: number, options: BeaconObjectOptions = {}) {
		this.objectId = options.objectId;
		this.isExpired = options.isExpired ?? false;
		const isDirect = options.isDirect ?? content.visibilityType === 'direct';
		this.baseColor = isDirect ? DIRECT_BEACON_COLOR : BEACON_COLOR;
		this.cardHeight = BEACON_WIDTH; // Square card

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'pointer' : 'default';
		// Perf: fixed bounds prevents recursive measurement of all children
		this.container.boundsArea = new Rectangle(-20, -20, BEACON_WIDTH + 40, this.cardHeight + 40);

		// --- Layer 1: Ripple emanation (behind everything) ---
		this.rippleLayer = new Container();
		this.rippleLayer.x = BEACON_WIDTH / 2;
		this.rippleLayer.y = this.cardHeight / 2;
		this.container.addChild(this.rippleLayer);

		// --- Layer 2: Ambient glow (soft radiance circle) ---
		this.ambientGlow = new Graphics();
		this.drawAmbientGlow();
		this.ambientGlow.alpha = 0.5;
		this.container.addChild(this.ambientGlow);

		// --- Layer 3: Outer diffuse glow ---
		this.outerGlow = new Graphics();
		this.drawOuterGlow();
		this.outerGlow.alpha = 0.6;
		this.container.addChild(this.outerGlow);

		// --- Layer 4: Inner glow ring ---
		this.glowRing = new Graphics();
		this.drawGlowRing();
		this.glowRing.alpha = 0.6;
		this.container.addChild(this.glowRing);

		// --- Layer 5: Card background (dark base) ---
		this.cardBg = new Graphics();
		this.cardBg.roundRect(0, 0, BEACON_WIDTH, this.cardHeight, CORNER_RADIUS);
		this.cardBg.fill(this.isExpired ? 0x1a1a2e : 0x0a0a14);
		this.container.addChild(this.cardBg);

		// --- Layer 5b: Halftone dot display (sprite-based, no per-frame geometry rebuild) ---
		if (!this.isExpired) {
			this.halftoneContainer = new Container();
			this.container.addChild(this.halftoneContainer);

			const tex = getCircleTexture();
			const cell = HALFTONE_CELL;
			const cols = Math.ceil(BEACON_WIDTH / cell);
			const rows = Math.ceil(this.cardHeight / cell);
			const cx = BEACON_WIDTH / 2;
			const cy = this.cardHeight / 2;
			const aspect = BEACON_WIDTH / this.cardHeight;

			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const x = col * cell + cell / 2;
					const y = row * cell + cell / 2;
					const nx = (x - cx) / cx;
					const ny = ((y - cy) / cy) / aspect;
					const dist = Math.sqrt(nx * nx + ny * ny);

					const sprite = new Sprite(tex);
					sprite.anchor.set(0.5);
					sprite.x = x;
					sprite.y = y;
					sprite.tint = this.baseColor;
					sprite.scale.set(0.03);
					sprite.alpha = 0.15;
					this.halftoneContainer.addChild(sprite);
					this.halftoneDots.push({ sprite, dist });
				}
			}

			// Perf: fixed bounds area prevents recursive child measurement
			this.halftoneContainer.boundsArea = new Rectangle(0, 0, BEACON_WIDTH, this.cardHeight);
			// Perf: cache 144 sprites as a single texture — PixiJS draws 1 quad
			// instead of 144 on frames where we don't update the halftone
			this.halftoneContainer.cacheAsTexture({ antialias: true });

			// Drive halftone — throttled to every 5th frame (~12fps)
			// The wave effect is slow enough that 12fps looks smooth
			this.animTick = () => {
				this.halftoneTime += 0.016;
				if (++this.halftoneFrame % 5 === 0) {
					this.updateHalftone();
					// Re-render cached texture after sprite updates
					this.halftoneContainer?.updateCacheTexture();
				}
			};
			gsap.ticker.add(this.animTick);
			this.updateHalftone();
			this.halftoneContainer.updateCacheTexture();
		}

		// --- Layer 6: Signal dot (antenna at top center) ---
		this.signalDot = new Graphics();
		this.signalDot.circle(0, 0, 6);
		this.signalDot.fill({ color: 0xffffff, alpha: 0.9 });
		this.signalDot.circle(0, 0, 3);
		this.signalDot.fill(this.baseColor);
		this.signalDot.x = BEACON_WIDTH / 2;
		this.signalDot.y = -3;
		this.signalDot.alpha = 0.7;
		this.container.addChild(this.signalDot);

		// --- Layer 7: Text content ---
		const titleStyle = new TextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 32,
			fontWeight: 'bold',
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: BEACON_WIDTH - BEACON_PADDING * 2,
			lineHeight: 40,
		});
		const titleText = new Text({ text: content.title, style: titleStyle });
		titleText.x = BEACON_PADDING;
		titleText.y = BEACON_PADDING;
		this.container.addChild(titleText);

		// Date line (separate from time)
		const { dateStr, timeStr } = this.formatDateAndTime(content.startTime, content.endTime);
		const detailStyle = new TextStyle({
			fontFamily: FONT_FAMILY,
			fontSize: 20,
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: BEACON_WIDTH - BEACON_PADDING * 2,
		});
		const dateText = new Text({ text: dateStr, style: detailStyle });
		dateText.x = BEACON_PADDING;
		dateText.y = titleText.y + titleText.height + 16;
		dateText.alpha = 0.85;
		this.container.addChild(dateText);

		// Time line
		const timeText = new Text({ text: timeStr, style: detailStyle });
		timeText.x = BEACON_PADDING;
		timeText.y = dateText.y + dateText.height + 8;
		timeText.alpha = 0.75;
		this.container.addChild(timeText);

		// "From [username]" for direct beacons — above bottom info
		if (isDirect && content.fromUsername) {
			const fromText = new Text({ text: `From ${content.fromUsername}`, style: detailStyle });
			fromText.x = BEACON_PADDING;
			fromText.y = this.cardHeight - BEACON_PADDING - (content.locationAddress ? 58 : 30);
			fromText.alpha = 0.7;
			this.container.addChild(fromText);
		}

		// Location — pinned to bottom with proper padding
		if (content.locationAddress) {
			const locText = new Text({ text: `📍 ${content.locationAddress}`, style: detailStyle });
			locText.x = BEACON_PADDING;
			locText.y = this.cardHeight - BEACON_PADDING - 28;
			locText.alpha = 0.75;
			this.container.addChild(locText);
		}

		// Expired label
		if (this.isExpired) {
			this.container.alpha = 0.3;
			const expStyle = new TextStyle({
				fontFamily: FONT_FAMILY,
				fontSize: 22,
				fontWeight: 'bold',
				fill: 0xffffff,
			});
			const expText = new Text({ text: 'Expired', style: expStyle });
			expText.x = BEACON_WIDTH / 2 - expText.width / 2;
			expText.y = this.cardHeight / 2 - 8;
			this.container.addChild(expText);
		}

		// --- Delete button (trash icon, top-right corner, owner only) ---
		if (options.editable !== false && options.onDelete) {
			const delBtn = new Container();
			delBtn.eventMode = 'static';
			delBtn.cursor = CURSOR_POINTER;

			const cx = BEACON_WIDTH - 14;
			const cy = this.cardHeight - 14;

			const delBg = new Graphics();
			delBg.circle(cx, cy, 12);
			delBg.fill({ color: 0x000000, alpha: 0.5 });
			delBtn.addChild(delBg);

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
			// Body lines
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

		// --- Interactions ---
		if (options.editable !== false) {
			makeDraggable(this.container, {
				onDragEnd: (finalX, finalY) => {
					if (this.objectId && options.onDragEnd) {
						options.onDragEnd(this.objectId, finalX, finalY);
					}
				},
				onDragMove: (x, y) => {
					if (this.objectId && options.onDragMove) {
						options.onDragMove(this.objectId, x, y);
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

		// Tap handler
		if (options.onTap) {
			makeTappable(this.container, () => {
				if (this.objectId) options.onTap!(this.objectId);
			});
		}

		// --- Pop-in animation ---
		if (options.animate !== false) {
			this.container.scale.set(0);
			gsap.to(this.container.scale, {
				x: 1, y: 1, duration: 0.5, ease: 'back.out(1.7)',
				onComplete: () => {
					// Arrival burst — signal dot announces the beacon
					if (!this.isExpired) {
						gsap.fromTo(this.signalDot.scale, { x: 1, y: 1 }, {
							x: 2, y: 2, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1,
						});
						gsap.fromTo(this.signalDot, { alpha: 0.7 }, {
							alpha: 1, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1,
						});
					}
				},
			});
		}

		// Hover expand
		this.cleanupHover = makeHoverable(this.container);

		// Start living pulse if not expired
		if (!this.isExpired) {
			this.startLivingPulse();
		}
	}

	// --- Glow layer drawing ---

	/** Ambient glow — large soft circle radiating warmth beyond the card */
	private drawAmbientGlow() {
		this.ambientGlow.clear();
		const cx = BEACON_WIDTH / 2;
		const cy = this.cardHeight / 2;
		const r = Math.max(BEACON_WIDTH, this.cardHeight) * 0.6;
		this.ambientGlow.circle(cx, cy, r);
		this.ambientGlow.fill({ color: this.baseColor, alpha: 0.10 });
	}

	/** Outer diffuse glow — wide, soft halo around the card */
	private drawOuterGlow() {
		this.outerGlow.clear();
		this.outerGlow.roundRect(-18, -18, BEACON_WIDTH + 36, this.cardHeight + 36, CORNER_RADIUS + 12);
		this.outerGlow.fill({ color: this.baseColor, alpha: 0.12 });
	}

	/** Inner glow ring — tight pulsing ring around the card */
	private drawGlowRing() {
		this.glowRing.clear();
		this.glowRing.roundRect(-8, -8, BEACON_WIDTH + 16, this.cardHeight + 16, CORNER_RADIUS + 6);
		this.glowRing.fill({ color: this.baseColor, alpha: 0.25 });
	}

	// --- Living pulse system ---

	/** Start the cascading heartbeat + ripple emanation */
	private startLivingPulse() {
		this.pulseTl = gsap.timeline({ repeat: -1, repeatDelay: HEARTBEAT_REPEAT_DELAY });

		// Beat origin: Signal dot flash
		this.pulseTl.to(this.signalDot.scale, {
			x: 1.5, y: 1.5, duration: 0.15, ease: 'power2.out',
		}, 0);
		this.pulseTl.to(this.signalDot, {
			alpha: 1, duration: 0.15, ease: 'power2.out',
		}, 0);
		this.pulseTl.to(this.signalDot.scale, {
			x: 1, y: 1, duration: 0.4, ease: 'power2.in',
		}, 0.15);
		this.pulseTl.to(this.signalDot, {
			alpha: 0.7, duration: 0.4, ease: 'power2.in',
		}, 0.15);

		// Wave reaches inner glow ring
		this.pulseTl.to(this.glowRing, {
			alpha: 1.0, duration: 0.2, ease: 'power2.out',
		}, 0.08);
		this.pulseTl.to(this.glowRing.scale, {
			x: 1.12, y: 1.12, duration: 0.2, ease: 'power2.out',
		}, 0.08);
		this.pulseTl.to(this.glowRing, {
			alpha: 0.6, duration: 0.45, ease: 'sine.out',
		}, 0.28);
		this.pulseTl.to(this.glowRing.scale, {
			x: 1, y: 1, duration: 0.45, ease: 'sine.out',
		}, 0.28);

		// Wave reaches outer glow
		this.pulseTl.to(this.outerGlow, {
			alpha: 1.0, duration: 0.25, ease: 'power2.out',
		}, 0.15);
		this.pulseTl.to(this.outerGlow.scale, {
			x: 1.06, y: 1.06, duration: 0.25, ease: 'power2.out',
		}, 0.15);
		this.pulseTl.to(this.outerGlow, {
			alpha: 0.6, duration: 0.45, ease: 'sine.out',
		}, 0.4);
		this.pulseTl.to(this.outerGlow.scale, {
			x: 1, y: 1, duration: 0.45, ease: 'sine.out',
		}, 0.4);

		// Wave reaches ambient glow
		this.pulseTl.to(this.ambientGlow, {
			alpha: 1.0, duration: 0.3, ease: 'power2.out',
		}, 0.12);
		this.pulseTl.to(this.ambientGlow, {
			alpha: 0.5, duration: 0.5, ease: 'sine.out',
		}, 0.42);

		// Card micro-scale bump — the whole card breathes
		this.pulseTl.to(this.cardBg.scale, {
			x: 1.006, y: 1.006, duration: 0.15, ease: 'power2.out',
		}, 0.10);
		this.pulseTl.to(this.cardBg.scale, {
			x: 1, y: 1, duration: 0.35, ease: 'sine.out',
		}, 0.25);

		// Start ripple emanation
		this.startRipples();
	}

	// --- Ripple emanation ---

	/** Begin spawning ripple circles at regular intervals */
	private startRipples() {
		this.spawnRipple();
		this.rippleInterval = setInterval(() => this.spawnRipple(), RIPPLE_SPAWN_MS);
	}

	/** Stop spawning ripples and clean up active ones */
	private stopRipples() {
		if (this.rippleInterval) {
			clearInterval(this.rippleInterval);
			this.rippleInterval = null;
		}
		for (const entry of this.activeRipples) {
			for (const t of entry.tweens) t.kill();
			this.rippleLayer.removeChild(entry.graphics);
			entry.graphics.destroy();
		}
		this.activeRipples = [];
	}

	/** Spawn a single expanding ripple circle */
	private spawnRipple() {
		if (this.activeRipples.length >= RIPPLE_MAX_ALIVE) return;

		const ripple = new Graphics();
		// Draw circle centered at (0,0) — rippleLayer is positioned at card center
		const radius = Math.max(BEACON_WIDTH, this.cardHeight) * 0.35;
		ripple.circle(0, 0, radius);
		ripple.stroke({ width: 1.5, color: this.baseColor, alpha: 0.4 });
		ripple.alpha = 0.25;
		ripple.scale.set(0.3);
		this.rippleLayer.addChild(ripple);

		const entry: { graphics: Graphics; tweens: gsap.core.Tween[] } = { graphics: ripple, tweens: [] };

		const onComplete = () => {
			this.rippleLayer.removeChild(ripple);
			ripple.destroy();
			const idx = this.activeRipples.indexOf(entry);
			if (idx !== -1) this.activeRipples.splice(idx, 1);
		};

		// Scale outward
		entry.tweens.push(gsap.to(ripple.scale, {
			x: RIPPLE_MAX_SCALE, y: RIPPLE_MAX_SCALE,
			duration: RIPPLE_DURATION,
			ease: 'power1.out',
		}));

		// Fade out (with onComplete to clean up)
		entry.tweens.push(gsap.to(ripple, {
			alpha: 0,
			duration: RIPPLE_DURATION,
			ease: 'power1.out',
			onComplete,
		}));

		this.activeRipples.push(entry);
	}

	// --- Halftone updater (CodePen-inspired: Luma → Size) ---

	/** Update sprite scale/alpha based on signal wave intensity — no geometry rebuild */
	private updateHalftone() {
		const dots = this.halftoneDots;
		const len = dots.length;
		if (len === 0) return;
		// Guard: bail if sprites were destroyed (container teardown race)
		if (dots[0].sprite.destroyed) return;

		const t = this.halftoneTime;
		const scaleRange = (HALFTONE_CELL * 0.84) / HALFTONE_TEX_SIZE;
		const minScale = 1 / HALFTONE_TEX_SIZE;

		// Pre-compute values shared across all dots (avoid per-dot redundancy)
		const tA = t * 2.2;
		const tB = t * 1.3 - 2;
		const breath = Math.sin(t * 0.8) * 0.08 + 0.12;

		for (let i = 0; i < len; i++) {
			const dot = dots[i];
			const d = dot.dist;

			// Simplified wave: one sin + squaring (cheaper than Math.pow)
			const raw1 = Math.sin(d * 20 - tA) * 0.5 + 0.5;
			const w1 = raw1 * raw1; // ~pow 2 (close enough to 2.5, much cheaper)
			const f1 = 1 - d * 1.7;

			const raw2 = Math.sin(d * 12 - tB) * 0.5 + 0.5;
			const w2 = raw2 * raw2 * raw2 * 0.35; // ~pow 3 (close enough to 4)
			const f2 = 1 - d * 2;

			const center = (1 - d * 2.5) * 0.6;

			let intensity = (f1 > 0 ? w1 * f1 : 0) + (f2 > 0 ? w2 * f2 : 0) + breath + (center > 0 ? center : 0);
			if (intensity > 1) intensity = 1;

			const s = minScale + scaleRange * intensity;
			dot.sprite.scale.set(s);
			dot.sprite.alpha = 0.15 + 0.85 * intensity;
		}
	}

	// --- Pulse control ---

	/** Stop all living pulse animations */
	stopPulse() {
		if (this.pulseTl) {
			this.pulseTl.kill();
			this.pulseTl = null;
		}
		this.stopRipples();

		// Stop halftone animation
		if (this.animTick) {
			gsap.ticker.remove(this.animTick);
			this.animTick = null;
		}
		// Dim all dots + release cached texture (no longer animating)
		for (const dot of this.halftoneDots) {
			dot.sprite.scale.set(0.03);
			dot.sprite.alpha = 0.1;
		}
		if (this.halftoneContainer) {
			this.halftoneContainer.updateCacheTexture();
		}

		// Reset glow layers to dim
		gsap.killTweensOf(this.signalDot);
		gsap.killTweensOf(this.signalDot.scale);
		gsap.killTweensOf(this.glowRing);
		gsap.killTweensOf(this.glowRing.scale);
		gsap.killTweensOf(this.outerGlow);
		gsap.killTweensOf(this.outerGlow.scale);
		gsap.killTweensOf(this.ambientGlow);
		gsap.killTweensOf(this.cardBg.scale);

		this.signalDot.alpha = 0.3;
		this.glowRing.alpha = 0.15;
		this.outerGlow.alpha = 0.15;
		this.ambientGlow.alpha = 0.15;
		this.cardBg.scale.set(1);
	}

	setExpired() {
		this.isExpired = true;
		this.container.alpha = 0.3;
		this.stopPulse();
	}

	/** Stop all tweens, animations, and clean up before removal */
	destroy() {
		// Remove ticker FIRST to prevent updateHalftone() from accessing destroyed sprites
		if (this.animTick) {
			gsap.ticker.remove(this.animTick);
			this.animTick = null;
		}
		this.cleanupHover?.();
		this.stopPulse();
		// Clean up halftone sprites + cached texture
		this.halftoneDots = [];
		if (this.halftoneContainer) {
			this.halftoneContainer.cacheAsTexture(false); // release cached render texture
			this.halftoneContainer.destroy({ children: true });
			this.halftoneContainer = null;
		}
	}

	/** Response dots — small colored circles indicating people */
	updateResponseDots(responses: Array<{ status: string }>) {
		if (responses.length === 0) {
			if (this.responseDots) {
				this.responseDots.clear();
				this.responseDots.visible = false;
			}
			return;
		}

		if (!this.responseDots) {
			this.responseDots = new Graphics();
			this.container.addChild(this.responseDots);
		}

		this.responseDots.clear();
		this.responseDots.visible = true;
		const dotSize = 6;
		const gap = 4;
		let xPos = BEACON_WIDTH - BEACON_PADDING;

		for (let i = Math.min(responses.length, 8) - 1; i >= 0; i--) {
			xPos -= dotSize * 2 + gap;
			const color = responses[i].status === 'joining' ? 0x4CAF50
				: responses[i].status === 'interested' ? 0xFFC107
				: 0x9E9E9E;
			this.responseDots.circle(xPos + dotSize, BEACON_PADDING + 4, dotSize);
			this.responseDots.fill(color);
		}
	}

	private calculateHeight(content: { title: string; startTime: number; endTime: number; locationAddress?: string; visibilityType: string; fromUsername?: string }): number {
		let h = BEACON_PADDING * 2 + 20 + 18; // padding + title line + time line
		if (content.locationAddress) h += 18;
		if (content.visibilityType === 'direct' && content.fromUsername) h += 18;
		return Math.max(h, 100);
	}

	private formatDateAndTime(start: number, end: number): { dateStr: string; timeStr: string } {
		const s = new Date(start);
		const e = new Date(end);
		const now = new Date();
		const isToday = s.toDateString() === now.toDateString();
		const dateStr = isToday ? 'Today' : s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
		const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return { dateStr, timeStr: `${startTime} – ${endTime}` };
	}
}
