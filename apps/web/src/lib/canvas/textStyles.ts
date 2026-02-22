import { TextStyle } from 'pixi.js';

/** Shared font family string — used by all canvas object TextStyles */
export const FONT_FAMILY = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Custom cursor URL strings for PixiJS — match the CSS cursors in app.css */
export const CURSOR_DEFAULT = "url('/cursor-default.svg') 2 1, default";
export const CURSOR_POINTER = "url('/cursor-pointer.svg') 10 10, pointer";
export const CURSOR_GRAB = "url('/cursor-grab.svg') 10 10, grab";
export const CURSOR_GRABBING = "url('/cursor-grabbing.svg') 10 10, grabbing";

/** Shared TextStyle for remote cursor labels — one instance reused across all cursors */
export const CURSOR_LABEL_STYLE = new TextStyle({
	fontFamily: FONT_FAMILY,
	fontSize: 16,
	fill: 0xffffff,
});
