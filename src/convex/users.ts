import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";

/** Characters for friend codes — no ambiguous chars (0/O/1/l/I) */
const FRIEND_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const FRIEND_CODE_LENGTH = 10;

/** Generate a random friend code, collision-checked against the database */
async function generateFriendCode(ctx: MutationCtx): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		let code = "";
		for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
			code += FRIEND_CODE_CHARS[Math.floor(Math.random() * FRIEND_CODE_CHARS.length)];
		}
		const existing = await ctx.db
			.query("users")
			.withIndex("by_friend_code", (q) => q.eq("friendCode", code))
			.first();
		if (!existing) return code;
	}
	throw new Error("Failed to generate unique friend code");
}

/** Verify the caller is authenticated and return their Astrophage user */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
	const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
	if (!authUser) throw new Error("Not authenticated");

	const user = await ctx.db
		.query("users")
		.withIndex("by_auth_account", (q) => q.eq("authAccountId", authUser._id))
		.first();
	if (!user) throw new Error("User not found");

	return user;
}

/** Create a new Astrophage user with a UUID and auto-create their personal canvas */
export const createUser = mutation({
	args: {
		username: v.string(),
		displayName: v.string(),
	},
	handler: async (ctx, args) => {
		// Derive auth account ID from the session — don't trust client input
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) {
			throw new Error("Not authenticated");
		}

		const authAccountId = authUser._id;

		// Validate string lengths
		if (args.username.length < 3 || args.username.length > 30) {
			throw new Error("Username must be 3–30 characters");
		}
		if (args.displayName.length < 1 || args.displayName.length > 50) {
			throw new Error("Display name must be 1–50 characters");
		}

		// Check if user already exists for this auth account
		const existing = await ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", authAccountId))
			.first();

		if (existing) return existing._id;

		const uuid = crypto.randomUUID();
		const friendCode = await generateFriendCode(ctx);

		const userId = await ctx.db.insert("users", {
			uuid,
			authAccountId,
			username: args.username,
			displayName: args.displayName,
			friendCode,
		});

		// Auto-create personal canvas
		await ctx.db.insert("canvases", {
			ownerId: uuid,
			name: `${args.username}'s Orbyt`,
			type: "personal",
			bounds: { width: 3000, height: 2000 },
		});

		return userId;
	},
});

/** Look up an Astrophage user by their Better Auth account ID (auth-protected) */
export const getByAuthAccount = query({
	args: { authAccountId: v.string() },
	handler: async (ctx, args) => {
		// Verify the caller is authenticated and requesting their own record
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser || authUser._id !== args.authAccountId) return null;

		return ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", args.authAccountId))
			.first();
	},
});

/** Ensure the current user has a friend code (backfill for pre-Layer 3 users) */
export const ensureFriendCode = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx);
		if (user.friendCode) return user.friendCode;

		const friendCode = await generateFriendCode(ctx);
		await ctx.db.patch(user._id, { friendCode });
		return friendCode;
	},
});

/** Verify the caller is authenticated — for use by actions via ctx.runQuery */
export const verifyAuth = internalQuery({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx);
		return user.uuid;
	},
});

/** Look up an Astrophage user by UUID (auth-protected — returns public fields only) */
export const getByUuid = query({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_uuid", (q) => q.eq("uuid", args.uuid))
			.first();
		if (!user) return null;

		// Only expose public fields — strip friendCode, authAccountId, _id
		return {
			uuid: user.uuid,
			username: user.username,
			displayName: user.displayName,
		};
	},
});
