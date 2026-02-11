import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

/** Create a new Astrophage user with a UUID and auto-create their personal canvas */
export const createUser = mutation({
	args: {
		authAccountId: v.string(),
		username: v.string(),
		displayName: v.string(),
	},
	handler: async (ctx, args) => {
		// Verify the caller is authenticated and matches the claimed authAccountId
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser || authUser._id !== args.authAccountId) {
			throw new Error("Not authorized to create this user");
		}

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
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", args.authAccountId))
			.first();

		if (existing) return existing._id;

		const uuid = crypto.randomUUID();

		const userId = await ctx.db.insert("users", {
			uuid,
			authAccountId: args.authAccountId,
			username: args.username,
			displayName: args.displayName,
		});

		// Auto-create personal canvas
		await ctx.db.insert("canvases", {
			ownerId: uuid,
			name: `${args.username}'s canvas`,
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

/** Look up an Astrophage user by UUID (auth-protected — profiles are private) */
export const getByUuid = query({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) return null;

		return ctx.db
			.query("users")
			.withIndex("by_uuid", (q) => q.eq("uuid", args.uuid))
			.first();
	},
});
