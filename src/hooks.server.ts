import type { Handle } from "@sveltejs/kit";
import { createAuth } from "$convex/auth.js";
import { getToken } from "@mmailaender/convex-better-auth-svelte/sveltekit";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
	"default-src 'self'",
	isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
	"style-src 'self' 'unsafe-inline' https://api.fontshare.com",
	"img-src 'self' data: blob: https://*.convex.cloud https://i.scdn.co https://i.ytimg.com https://*.mzstatic.com https://mosaic.scdn.co",
	"font-src 'self' https://cdn.fontshare.com",
	`connect-src 'self' wss://*.convex.cloud https://*.convex.cloud${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
	"frame-src https://open.spotify.com https://www.youtube.com https://embed.music.apple.com",
	"worker-src 'self' blob:",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = await getToken(createAuth, event.cookies);

	const response = await resolve(event);

	// Only add CSP to HTML page responses (API routes have immutable headers)
	if (response.headers.get("content-type")?.includes("text/html")) {
		const newResponse = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers),
		});
		newResponse.headers.set("Content-Security-Policy", csp);
		newResponse.headers.set("X-Frame-Options", "DENY");
		newResponse.headers.set("X-Content-Type-Options", "nosniff");
		newResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		newResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
		return newResponse;
	}

	return response;
};
