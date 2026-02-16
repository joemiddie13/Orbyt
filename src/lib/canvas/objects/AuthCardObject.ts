import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from '../gsapInit';
import { FONT_FAMILY, CURSOR_GRAB } from '../textStyles';
import { makeDraggable } from '../interactions/DragDrop';

/**
 * AuthCardObject — the soul of the landing page.
 *
 * A large glassmorphic manifesto card that declares what Orbyt stands for.
 * Heavy GSAP animation: staggered text reveals, breathing glow, floating particles,
 * gentle float. Dissolves on sign-in as part of the cinematic transition.
 */

const CARD_WIDTH = 620;
const CORNER_RADIUS = 28;
const BG_COLOR = 0x0f0e1a;
const GLOW_COLOR = 0xF59E0B;
const GLOW_COLOR_LIGHT = 0xfbbf24;

export class AuthCardObject {
	container: Container;
	private cardBg: Graphics;
	private glowOuter: Graphics;
	private glowInner: Graphics;
	private cardWidth: number;
	private cardHeight: number;
	private particles: Graphics[] = [];
	private allTexts: Text[] = [];
	private dividers: Graphics[] = [];
	private entranceTl: gsap.core.Timeline | null = null;
	private floatTween: gsap.core.Tween | null = null;

	constructor(x: number, y: number) {
		this.cardWidth = CARD_WIDTH;
		this.cardHeight = 100; // placeholder — set after layout

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = CURSOR_GRAB;

		// --- Glow layers (rendered first, behind everything) ---
		this.glowOuter = new Graphics();
		this.glowOuter.alpha = 0;
		this.container.addChild(this.glowOuter);

		this.glowInner = new Graphics();
		this.glowInner.alpha = 0;
		this.container.addChild(this.glowInner);

		// --- Card background ---
		this.cardBg = new Graphics();
		this.container.addChild(this.cardBg);

		// ── TEXT LAYOUT ─────────────────────────────────────────────────
		const cx = this.cardWidth / 2;
		let yPos = 44;

		// Brand
		const brand = this.text('ORBYT', 72, 'bold', 0xffffff, 1, cx, yPos);
		yPos += brand.height + 8;

		// Tagline — the thesis
		const tagline = this.text('Your attention is sacred.', 30, 'bold', GLOW_COLOR, 0.95, cx, yPos);
		yPos += tagline.height + 28;

		// ── Divider 1
		const div1 = this.divider(yPos);
		yPos += 26;

		// What we reject
		const r1 = this.text('No feeds. No algorithms. No likes.', 22, 'normal', 0xffffff, 0.8, cx, yPos);
		yPos += r1.height + 6;
		const r2 = this.text('No infinite scroll. No dopamine traps.', 22, 'normal', 0xffffff, 0.8, cx, yPos);
		yPos += r2.height + 22;

		// What we are
		const a1 = this.text('A canvas for your people.', 24, 'normal', 0xffffff, 0.92, cx, yPos);
		yPos += a1.height + 6;
		const a2 = this.text('Real plans. Real presence.', 24, 'normal', 0xffffff, 0.92, cx, yPos);
		yPos += a2.height + 26;

		// The call — big, bold, amber
		const c1 = this.text('Reclaim your time.', 32, 'bold', GLOW_COLOR, 1, cx, yPos);
		yPos += c1.height + 6;
		const c2 = this.text('Show up. Be present. Live.', 32, 'bold', GLOW_COLOR, 1, cx, yPos);
		yPos += c2.height + 28;

		// ── Divider 2
		const div2 = this.divider(yPos);
		yPos += 26;

		// CTA
		const cta = this.text('Sign in or sign up above to begin  \u2191', 17, 'normal', GLOW_COLOR_LIGHT, 0.6, cx, yPos);
		yPos += cta.height + 40;

		// ── Finalize card dimensions & draw backgrounds ────────────────
		this.cardHeight = yPos;
		this.drawCardBg();
		this.drawOuterGlow();
		this.drawInnerGlow();

		// ── Floating particles (behind card bg, peeking around edges) ──
		this.spawnParticles(14);

		// ── Draggable ──────────────────────────────────────────────────
		makeDraggable(this.container, {
			onDragStart: () => {
				// Kill the float tween so it doesn't fight the drag
				if (this.floatTween) {
					this.floatTween.kill();
					this.floatTween = null;
				}
			},
			onDragEnd: () => {
				// Restart float from new position
				this.floatTween = gsap.to(this.container, {
					y: this.container.y - 8,
					duration: 4,
					ease: 'sine.inOut',
					repeat: -1,
					yoyo: true,
				});
			},
		});

		// ── ENTRANCE CHOREOGRAPHY ──────────────────────────────────────
		this.container.scale.set(0);
		this.container.alpha = 0;

		const tl = gsap.timeline({ delay: 0.4 });
		this.entranceTl = tl;

		// Card materializes
		tl.to(this.container, { alpha: 1, duration: 0.4, ease: 'power2.out' }, 0);
		tl.to(this.container.scale, { x: 1, y: 1, duration: 1, ease: 'back.out(1.2)' }, 0);

		// Glow fades in with the card
		tl.to(this.glowOuter, { alpha: 0.55, duration: 1.2, ease: 'power2.out' }, 0.2);
		tl.to(this.glowInner, { alpha: 0.4, duration: 0.8, ease: 'power2.out' }, 0.3);

		// Text lines cascade in — each slides up and fades
		this.allTexts.forEach((t, i) => {
			tl.from(t, { alpha: 0, y: '+=22', duration: 0.5, ease: 'power2.out' }, 0.5 + i * 0.1);
		});

		// Dividers draw from center
		this.dividers.forEach((d, i) => {
			tl.to(d.scale, { x: 1, duration: 0.6, ease: 'power2.inOut' }, 0.8 + i * 0.9);
		});

		// ── CONTINUOUS LIFE ────────────────────────────────────────────

		// Glow breathes like a heartbeat
		gsap.to(this.glowOuter, {
			alpha: 0.85,
			duration: 2.5,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
			delay: 2.5,
		});

		// Card gently floats
		this.floatTween = gsap.to(this.container, {
			y: this.container.y - 8,
			duration: 4,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
			delay: 2,
		});

		// CTA text pulses softly
		gsap.to(cta, {
			alpha: 0.3,
			duration: 2,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
			delay: 3,
		});

		// "Reclaim your time" lines shimmer subtly
		gsap.to(c1, {
			alpha: 0.75,
			duration: 3,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
			delay: 3.5,
		});
		gsap.to(c2, {
			alpha: 0.75,
			duration: 3,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
			delay: 4,
		});
	}

	/** Get card dimensions for transition epicenter calculation */
	getCardBounds(): { width: number; height: number } {
		return { width: this.cardWidth, height: this.cardHeight };
	}

	/** Dissolve animation for auth transition */
	dissolve(): Promise<void> {
		return new Promise((resolve) => {
			this.killAllTweens();
			const tl = gsap.timeline({ onComplete: resolve });
			tl.to(this.container.scale, { x: 0, y: 0, duration: 0.4, ease: 'power2.in' }, 0);
			tl.to(this.container, { alpha: 0, duration: 0.3, ease: 'power2.in' }, 0);
		});
	}

	// ── Helpers ──────────────────────────────────────────────────────

	/** Create a centered Text, add to container & tracking array */
	private text(content: string, size: number, weight: string, fill: number, alpha: number, cx: number, y: number): Text {
		const t = new Text({
			text: content,
			style: new TextStyle({
				fontFamily: FONT_FAMILY,
				fontSize: size,
				fontWeight: weight as 'bold' | 'normal',
				fill,
				align: 'center',
			}),
		});
		t.alpha = alpha;
		t.x = cx - t.width / 2;
		t.y = y;
		this.container.addChild(t);
		this.allTexts.push(t);
		return t;
	}

	/** Create a horizontal divider line that animates drawing from center */
	private divider(y: number): Graphics {
		const w = this.cardWidth * 0.55;
		const g = new Graphics();
		g.rect(0, 0, w, 1);
		g.fill({ color: 0xffffff, alpha: 0.1 });
		g.pivot.x = w / 2;
		g.x = this.cardWidth / 2;
		g.y = y;
		g.scale.x = 0; // hidden — animated in by timeline
		this.container.addChild(g);
		this.dividers.push(g);
		return g;
	}

	/** Spawn ambient particles that drift behind the card */
	private spawnParticles(count: number) {
		const bgIndex = this.container.getChildIndex(this.cardBg);
		for (let i = 0; i < count; i++) {
			const dot = new Graphics();
			const r = 1.5 + Math.random() * 2.5;
			dot.circle(0, 0, r);
			dot.fill({ color: GLOW_COLOR, alpha: 0.12 + Math.random() * 0.18 });
			dot.x = -40 + Math.random() * (this.cardWidth + 80);
			dot.y = -40 + Math.random() * (this.cardHeight + 80);
			this.container.addChildAt(dot, bgIndex); // behind card bg
			this.particles.push(dot);

			gsap.to(dot, {
				y: dot.y + (Math.random() - 0.5) * 70,
				x: dot.x + (Math.random() - 0.5) * 50,
				alpha: 0.04 + Math.random() * 0.2,
				duration: 3 + Math.random() * 5,
				ease: 'sine.inOut',
				repeat: -1,
				yoyo: true,
				delay: Math.random() * 3,
			});
		}
	}

	// ── Drawing ─────────────────────────────────────────────────────

	private drawCardBg() {
		this.cardBg.clear();
		this.cardBg.roundRect(0, 0, this.cardWidth, this.cardHeight, CORNER_RADIUS);
		this.cardBg.fill({ color: BG_COLOR, alpha: 0.92 });
		this.cardBg.roundRect(0, 0, this.cardWidth, this.cardHeight, CORNER_RADIUS);
		this.cardBg.stroke({ width: 1, color: 0xffffff, alpha: 0.06 });
	}

	private drawOuterGlow() {
		this.glowOuter.clear();
		this.glowOuter.roundRect(-24, -24, this.cardWidth + 48, this.cardHeight + 48, CORNER_RADIUS + 14);
		this.glowOuter.fill({ color: GLOW_COLOR, alpha: 0.06 });
	}

	private drawInnerGlow() {
		this.glowInner.clear();
		this.glowInner.roundRect(-10, -10, this.cardWidth + 20, this.cardHeight + 20, CORNER_RADIUS + 6);
		this.glowInner.fill({ color: GLOW_COLOR, alpha: 0.1 });
	}

	// ── Cleanup ─────────────────────────────────────────────────────

	private killAllTweens() {
		if (this.entranceTl) { this.entranceTl.kill(); this.entranceTl = null; }
		if (this.floatTween) { this.floatTween.kill(); this.floatTween = null; }
		gsap.killTweensOf(this.container);
		gsap.killTweensOf(this.container.scale);
		gsap.killTweensOf(this.glowOuter);
		gsap.killTweensOf(this.glowInner);
		for (const p of this.particles) gsap.killTweensOf(p);
		for (const t of this.allTexts) gsap.killTweensOf(t);
		for (const d of this.dividers) gsap.killTweensOf(d.scale);
	}

	destroy() {
		this.killAllTweens();
	}
}
