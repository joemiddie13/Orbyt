import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/**
 * Canvas presence — tracks who's currently viewing each canvas.
 * Heartbeat every 30s, stale after 60s, cleanup cron every 2min.
 */

/** Join a canvas (upsert presence record) */
export const joinCanvas = mutation({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const existing = await ctx.db
			.query("canvasPresence")
			.withIndex("by_canvas_user", (q) =>
				q.eq("canvasId", args.canvasId).eq("userId", user.uuid),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { lastSeen: Date.now() });
			return existing._id;
		}

		return ctx.db.insert("canvasPresence", {
			canvasId: args.canvasId,
			userId: user.uuid,
			username: user.username,
			displayName: user.displayName,
			lastSeen: Date.now(),
		});
	},
});

/** Heartbeat — update lastSeen timestamp. Silently no-ops if unauthenticated (page unload). */
export const heartbeat = mutation({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return;

		const existing = await ctx.db
			.query("canvasPresence")
			.withIndex("by_canvas_user", (q) =>
				q.eq("canvasId", args.canvasId).eq("userId", user.uuid),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { lastSeen: Date.now() });
		} else {
			await ctx.db.insert("canvasPresence", {
				canvasId: args.canvasId,
				userId: user.uuid,
				username: user.username,
				displayName: user.displayName,
				lastSeen: Date.now(),
			});
		}
	},
});

/** Leave a canvas (delete presence record). Silently no-ops if unauthenticated (page unload). */
export const leaveCanvas = mutation({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return;

		const existing = await ctx.db
			.query("canvasPresence")
			.withIndex("by_canvas_user", (q) =>
				q.eq("canvasId", args.canvasId).eq("userId", user.uuid),
			)
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Get all current viewers of a canvas (excluding stale entries) */
export const getViewers = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		const cutoff = Date.now() - 60 * 1000; // 60s stale threshold

		const viewers = await ctx.db
			.query("canvasPresence")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		return viewers
			.filter((v) => v.lastSeen > cutoff)
			.map((v) => ({
				userId: v.userId,
				username: v.username,
				displayName: v.displayName,
				lastSeen: v.lastSeen,
			}));
	},
});

/** Clean up stale presence records (older than 60s) */
export const cleanupStalePresence = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - 60 * 1000;

		// No index on lastSeen, so we scan all and filter
		const all = await ctx.db.query("canvasPresence").collect();
		const stale = all.filter((p) => p.lastSeen < cutoff);

		for (const record of stale) {
			await ctx.db.delete(record._id);
		}

		return { cleaned: stale.length };
	},
});
