import { v } from "convex/values";
import { query } from "./_generated/server";

/** Get the personal canvas for a user (by their UUID) */
export const getPersonalCanvas = query({
	args: { ownerId: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("canvases")
			.withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
			.filter((q) => q.eq(q.field("type"), "personal"))
			.first();
	},
});
