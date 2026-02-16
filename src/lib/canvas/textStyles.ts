import { TextStyle } from 'pixi.js';

/** Shared font family string — used by all canvas object TextStyles */
export const FONT_FAMILY = "'Satoshi', system-ui, -apple-system, sans-serif";

/** Shared TextStyle for remote cursor labels — one instance reused across all cursors */
export const CURSOR_LABEL_STYLE = new TextStyle({
	fontFamily: FONT_FAMILY,
	fontSize: 11,
	fill: 0xffffff,
});
