/**
 * Shared validation constants and helpers for Convex functions.
 * Single source of truth for canvas bounds, text limits, and beacon timing rules.
 */

// --- Canvas bounds ---
export const CANVAS_MAX_X = 3000;
export const CANVAS_MAX_Y = 2000;
export const MAX_OBJECT_SIZE = 1000;

// --- Text limits ---
export const MAX_TEXT_LENGTH = 10000;
export const MAX_NOTE_TITLE_LENGTH = 100;
export const MAX_BEACON_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_LOCATION_LENGTH = 500;
export const MAX_CAPTION_LENGTH = 200;

// --- Music limits ---
export const MAX_MUSIC_URL_LENGTH = 500;
export const MAX_MUSIC_TITLE_LENGTH = 300;
export const MAX_MUSIC_ARTIST_LENGTH = 200;

const SPOTIFY_RE = /^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\//;
const YOUTUBE_MUSIC_RE = /^https?:\/\/music\.youtube\.com\/watch/;
const YOUTUBE_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/;
const APPLE_MUSIC_RE = /^https?:\/\/music\.apple\.com\//;

/** Detect music platform from URL. Throws if unrecognized. */
export function validateMusicUrl(url: string): "spotify" | "apple-music" | "youtube" | "youtube-music" {
	if (url.length > MAX_MUSIC_URL_LENGTH) {
		throw new Error(`URL must be ${MAX_MUSIC_URL_LENGTH} characters or less`);
	}
	if (SPOTIFY_RE.test(url)) return "spotify";
	if (YOUTUBE_MUSIC_RE.test(url)) return "youtube-music";
	if (YOUTUBE_RE.test(url)) return "youtube";
	if (APPLE_MUSIC_RE.test(url)) return "apple-music";
	throw new Error("Unsupported music URL. Paste a Spotify, YouTube, YouTube Music, or Apple Music link.");
}

// --- Beacon timing ---
export const MAX_BEACON_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const START_TIME_GRACE_MS = 60_000; // 1 minute grace for "not in the past"

/** Validate position is within canvas bounds */
export function validatePosition(position: { x: number; y: number }) {
	if (position.x < 0 || position.x > CANVAS_MAX_X || position.y < 0 || position.y > CANVAS_MAX_Y) {
		throw new Error(`Position must be within canvas bounds (0–${CANVAS_MAX_X}, 0–${CANVAS_MAX_Y})`);
	}
}

/** Validate object size is within limits */
export function validateSize(size: { w: number; h: number }) {
	if (size.w <= 0 || size.w > MAX_OBJECT_SIZE || size.h <= 0 || size.h > MAX_OBJECT_SIZE) {
		throw new Error(`Object size must be between 1 and ${MAX_OBJECT_SIZE}`);
	}
}

/** Validate beacon timing constraints */
export function validateBeaconTiming(startTime: number, endTime: number) {
	if (startTime >= endTime) {
		throw new Error("Start time must be before end time");
	}
	if (startTime < Date.now() - START_TIME_GRACE_MS) {
		throw new Error("Start time cannot be in the past");
	}
	if (endTime - startTime > MAX_BEACON_DURATION_MS) {
		throw new Error("Beacon duration cannot exceed 90 days");
	}
	if (endTime - Date.now() > MAX_BEACON_DURATION_MS) {
		throw new Error("Beacon cannot expire more than 90 days from now");
	}
}

/** Validate beacon text fields (title, description, location) */
export function validateBeaconContent(content: {
	title: string;
	description?: string;
	locationAddress?: string;
}) {
	if (!content.title || content.title.length < 1 || content.title.length > MAX_BEACON_TITLE_LENGTH) {
		throw new Error(`Title must be 1–${MAX_BEACON_TITLE_LENGTH} characters`);
	}
	if (content.description && content.description.length > MAX_DESCRIPTION_LENGTH) {
		throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
	}
	if (content.locationAddress && content.locationAddress.length > MAX_LOCATION_LENGTH) {
		throw new Error(`Location must be ${MAX_LOCATION_LENGTH} characters or less`);
	}
}
