import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { type DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth/minimal";
import { username } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { expo } from "@better-auth/expo";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

/** Factory — creates a fresh Better Auth instance per request */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
	const siteUrl = process.env.SITE_URL;

	// Build plugin list — passkey requires a valid URL (only available in Convex runtime, not Vite SSR)
	const plugins: any[] = [
		convex({ authConfig }),
		username({
			usernameValidator: (username) => {
				// Allow letters, numbers, hyphens, underscores (3-30 chars)
				return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
			},
		}),
		expo(),
	];

	if (siteUrl) {
		const url = new URL(siteUrl);
		plugins.push(
			passkey({
				rpID: url.hostname,
				rpName: "Orbyt",
				origin: siteUrl,
			}),
		);
	}

	return betterAuth({
		baseURL: siteUrl,
		database: authComponent.adapter(ctx),
		trustedOrigins: [
			"http://localhost:5173",
			"https://orbyt.life",
			"orbyt://",
		],
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			minPasswordLength: 10,
			maxPasswordLength: 64,
		},
		plugins,
	});
};

/** Query the currently authenticated user — returns null if not signed in */
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		try {
			return await authComponent.getAuthUser(ctx);
		} catch {
			return null;
		}
	},
});
