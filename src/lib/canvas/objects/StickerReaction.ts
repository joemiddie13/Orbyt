import { Container, Text, TextStyle } from 'pixi.js';
import * as TWEEN from '@tweenjs/tween.js';

/**
 * StickerReaction — a small emoji sticker attached to a canvas object.
 *
 * Rendered as emoji text in PixiJS. Pop-in animation via tween.js
 * (scale 0 → 1.2 → 1 with elastic easing).
 */

const STICKER_EMOJI: Record<string, string> = {
	'heart': '❤️',
	'fire': '🔥',
	'laugh': '😂',
	'wave': '👋',
	'star': '⭐',
	'100': '💯',
	'thumbs-up': '👍',
	'eyes': '👀',
};

export const STICKER_TYPES = Object.keys(STICKER_EMOJI);

export function getStickerEmoji(type: string): string {
	return STICKER_EMOJI[type] ?? '❓';
}

export interface StickerData {
	_id: string;
	objectId: string;
	userId: string;
	stickerType: string;
	position: { x: number; y: number };
}

export class StickerReaction {
	container: Container;
	stickerId: string;
	private popInTween: TWEEN.Tween<{ s: number }> | null = null;

	constructor(data: StickerData, animate = true) {
		this.stickerId = data._id;
		this.container = new Container();
		this.container.x = data.position.x;
		this.container.y = data.position.y;

		const style = new TextStyle({
			fontSize: 20,
		});

		const emoji = new Text({ text: getStickerEmoji(data.stickerType), style });
		emoji.anchor.set(0.5);
		this.container.addChild(emoji);

		// Pop-in animation — must TWEEN.add() in v25 (tweens aren't auto-added to default group)
		if (animate) {
			this.container.scale.set(0);
			this.popInTween = new TWEEN.Tween({ s: 0 })
				.to({ s: 1 }, 500)
				.easing(TWEEN.Easing.Elastic.Out)
				.onUpdate(({ s }) => {
					this.container.scale.set(s);
				})
				.start();
			TWEEN.add(this.popInTween);
		}
	}

	/** Stop any running tweens before removal */
	destroy() {
		if (this.popInTween) {
			this.popInTween.stop();
			TWEEN.remove(this.popInTween);
			this.popInTween = null;
		}
	}
}
