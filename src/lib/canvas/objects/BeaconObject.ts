import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from '../gsapInit';
import { makeDraggable, makeLongPressable } from '../interactions/DragDrop';

/**
 * BeaconObject — a glowing event card on the canvas.
 *
 * Visual: rounded rect with amber/orange gradient, pin icon, title, time.
 * Pulse animation via tween.js (glow ring oscillates alpha + scale).
 * Pop-in animation on creation (scale 0 → 1 easeOutBack).
 */

const BEACON_WIDTH = 260;
const BEACON_PADDING = 16;
const CORNER_RADIUS = 16;
const BEACON_COLOR = 0xFFA726;
const BEACON_COLOR_DARK = 0xF57C00;
const DIRECT_BEACON_COLOR = 0x26A69A;

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
	isExpired?: boolean;
	isDirect?: boolean;
}

export class BeaconObject {
	container: Container;
	objectId?: string;
	private glowRing: Graphics;
	private pulseTween: gsap.core.Tween | null = null;
	private isExpired: boolean;

	constructor(content: BeaconContent, x: number, y: number, options: BeaconObjectOptions = {}) {
		this.objectId = options.objectId;
		this.isExpired = options.isExpired ?? false;
		const isDirect = options.isDirect ?? content.visibilityType === 'direct';
		const baseColor = isDirect ? DIRECT_BEACON_COLOR : BEACON_COLOR;

		this.container = new Container();
		this.container.x = x;
		this.container.y = y;
		this.container.eventMode = 'static';
		this.container.cursor = (options.editable !== false) ? 'pointer' : 'default';

		// Glow ring (pulse animation target)
		this.glowRing = new Graphics();
		this.drawGlowRing(baseColor);
		this.container.addChild(this.glowRing);

		// Background card
		const bg = new Graphics();
		const height = this.calculateHeight(content);
		bg.roundRect(0, 0, BEACON_WIDTH, height, CORNER_RADIUS);
		bg.fill(baseColor);
		// Darker bottom edge
		bg.roundRect(0, height - 4, BEACON_WIDTH, 4, 0);
		bg.fill(isDirect ? 0x00897B : BEACON_COLOR_DARK);
		this.container.addChild(bg);

		// Title
		const titleStyle = new TextStyle({
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fontSize: 15,
			fontWeight: 'bold',
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: BEACON_WIDTH - BEACON_PADDING * 2 - 24,
			lineHeight: 20,
		});
		const titleText = new Text({ text: content.title, style: titleStyle });
		titleText.x = BEACON_PADDING + 20;
		titleText.y = BEACON_PADDING;
		this.container.addChild(titleText);

		// Pin icon (simple circle)
		const pin = new Graphics();
		pin.circle(BEACON_PADDING + 7, BEACON_PADDING + 8, 6);
		pin.fill(0xffffff);
		pin.circle(BEACON_PADDING + 7, BEACON_PADDING + 8, 2);
		pin.fill(baseColor);
		this.container.addChild(pin);

		// Time display
		const timeStr = this.formatTimeRange(content.startTime, content.endTime);
		const timeStyle = new TextStyle({
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fontSize: 12,
			fill: 0xffffff,
			wordWrap: true,
			wordWrapWidth: BEACON_WIDTH - BEACON_PADDING * 2,
		});
		const timeText = new Text({ text: timeStr, style: timeStyle });
		timeText.x = BEACON_PADDING;
		timeText.y = titleText.y + titleText.height + 6;
		timeText.alpha = 0.85;
		this.container.addChild(timeText);

		// Location if present
		if (content.locationAddress) {
			const locStyle = new TextStyle({
				fontFamily: 'system-ui, -apple-system, sans-serif',
				fontSize: 11,
				fill: 0xffffff,
				wordWrap: true,
				wordWrapWidth: BEACON_WIDTH - BEACON_PADDING * 2,
			});
			const locText = new Text({ text: `📍 ${content.locationAddress}`, style: locStyle });
			locText.x = BEACON_PADDING;
			locText.y = timeText.y + timeText.height + 4;
			locText.alpha = 0.75;
			this.container.addChild(locText);
		}

		// "From [username]" for direct beacons
		if (isDirect && content.fromUsername) {
			const fromStyle = new TextStyle({
				fontFamily: 'system-ui, -apple-system, sans-serif',
				fontSize: 11,
				fill: 0xffffff,
			});
			const fromText = new Text({ text: `From ${content.fromUsername}`, style: fromStyle });
			fromText.x = BEACON_PADDING;
			fromText.y = height - BEACON_PADDING - 14;
			fromText.alpha = 0.7;
			this.container.addChild(fromText);
		}

		// Expired label
		if (this.isExpired) {
			this.container.alpha = 0.3;
			const expStyle = new TextStyle({
				fontFamily: 'system-ui, -apple-system, sans-serif',
				fontSize: 13,
				fontWeight: 'bold',
				fill: 0xffffff,
			});
			const expText = new Text({ text: 'Expired', style: expStyle });
			expText.x = BEACON_WIDTH / 2 - expText.width / 2;
			expText.y = height / 2 - 8;
			this.container.addChild(expText);
		}

		// Owner: full drag + long-press. Visitor: long-press only (sticker reactions).
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

		// Tap handler for viewing beacon details (works for all users)
		if (options.onTap) {
			let didMove = false;
			this.container.on('pointerdown', () => { didMove = false; });
			this.container.on('globalpointermove', () => { didMove = true; });
			this.container.on('pointerup', () => {
				if (!didMove && this.objectId) {
					options.onTap!(this.objectId);
				}
			});
		}

		// Pop-in animation
		if (options.animate !== false) {
			this.container.scale.set(0);
			gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.7)' });
		}

		// Start pulse if not expired
		if (!this.isExpired) {
			this.startPulse();
		}
	}

	/** Animated glow ring that pulses */
	private drawGlowRing(color: number) {
		this.glowRing.clear();
		this.glowRing.roundRect(-6, -6, BEACON_WIDTH + 12, this.calculateHeight({
			title: '', startTime: 0, endTime: 0,
			visibilityType: 'canvas',
		}) + 12, CORNER_RADIUS + 4);
		this.glowRing.fill({ color, alpha: 0.2 });
	}

	private startPulse() {
		this.glowRing.alpha = 0.2;
		this.glowRing.scale.set(1.0);
		this.pulseTween = gsap.to(this.glowRing, {
			alpha: 0.5,
			duration: 1.5,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
		});
		gsap.to(this.glowRing.scale, {
			x: 1.08,
			y: 1.08,
			duration: 1.5,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
		});
	}

	stopPulse() {
		gsap.killTweensOf(this.glowRing);
		gsap.killTweensOf(this.glowRing.scale);
		this.pulseTween = null;
		this.glowRing.alpha = 0.1;
	}

	setExpired() {
		this.isExpired = true;
		this.container.alpha = 0.3;
		this.stopPulse();
	}

	/** Stop tweens before destroying — prevents stale callbacks on destroyed Graphics */
	destroy() {
		this.stopPulse();
	}

	/** Response dots — small colored circles indicating people */
	private responseDots: Graphics | null = null;

	updateResponseDots(responses: Array<{ status: string }>) {
		if (this.responseDots) {
			this.container.removeChild(this.responseDots);
			this.responseDots.destroy();
		}

		if (responses.length === 0) return;

		this.responseDots = new Graphics();
		const dotSize = 5;
		const gap = 3;
		let xPos = BEACON_WIDTH - BEACON_PADDING;

		for (let i = Math.min(responses.length, 8) - 1; i >= 0; i--) {
			xPos -= dotSize * 2 + gap;
			const color = responses[i].status === 'joining' ? 0x4CAF50
				: responses[i].status === 'interested' ? 0xFFC107
				: 0x9E9E9E;
			this.responseDots.circle(xPos + dotSize, BEACON_PADDING + 4, dotSize);
			this.responseDots.fill(color);
		}

		this.container.addChild(this.responseDots);
	}

	private calculateHeight(content: { title: string; startTime: number; endTime: number; locationAddress?: string; visibilityType: string; fromUsername?: string }): number {
		let h = BEACON_PADDING * 2 + 20 + 18; // padding + title line + time line
		if (content.locationAddress) h += 18;
		if (content.visibilityType === 'direct' && content.fromUsername) h += 18;
		return Math.max(h, 80);
	}

	private formatTimeRange(start: number, end: number): string {
		const s = new Date(start);
		const e = new Date(end);
		const now = new Date();
		const isToday = s.toDateString() === now.toDateString();
		const dayLabel = isToday ? 'Today' : s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
		const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `${dayLabel} · ${startTime} – ${endTime}`;
	}
}
