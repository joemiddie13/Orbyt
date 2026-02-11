import { v } from "convex/values";
import { query } from "./_generated/server";
import { authComponent } from "./auth";

/** Get the personal canvas for the authenticated user */
export const getPersonalCanvas = query({
	args: { ownerId: v.string() },
	handler: async (ctx, args) => {
		// Verify the caller is authenticated and requesting their own canvas
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", authUser._id))
			.first();
		if (!user || user.uuid !== args.ownerId) return null;

		return ctx.db
			.query("canvases")
			.withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
			.filter((q) => q.eq(q.field("type"), "personal"))
			.first();
	},
});
