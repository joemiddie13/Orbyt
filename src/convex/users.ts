import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Create a new Astrophage user with a UUID and auto-create their personal canvas */
export const createUser = mutation({
	args: {
		authAccountId: v.string(),
		username: v.string(),
		displayName: v.string(),
	},
	handler: async (ctx, args) => {
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

/** Look up an Astrophage user by their Better Auth account ID */
export const getByAuthAccount = query({
	args: { authAccountId: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", args.authAccountId))
			.first();
	},
});

/** Look up an Astrophage user by UUID */
export const getByUuid = query({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("users")
			.withIndex("by_uuid", (q) => q.eq("uuid", args.uuid))
			.first();
	},
});
