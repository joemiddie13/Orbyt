import type { Handle } from "@sveltejs/kit";
import { createAuth } from "$convex/auth.js";
import { getToken } from "@mmailaender/convex-better-auth-svelte/sveltekit";

const csp = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self'",
	"connect-src 'self' wss://*.convex.cloud https://*.convex.cloud",
	"worker-src 'self' blob:",
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
		return newResponse;
	}

	return response;
};
