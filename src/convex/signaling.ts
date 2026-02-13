import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";

/**
 * WebRTC signaling via Convex — relays SDP offers/answers and ICE candidates
 * between peers. Access-controlled: both users must have canvas access.
 */

const MAX_SIGNAL_PAYLOAD = 10_000; // SDP offers ~2-4KB, ICE candidates ~200B

/** Send a signaling message (offer, answer, or ICE candidate) */
export const sendSignal = mutation({
	args: {
		canvasId: v.id("canvases"),
		toUserId: v.string(),
		type: v.union(
			v.literal("offer"),
			v.literal("answer"),
			v.literal("ice-candidate"),
		),
		payload: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		if (args.payload.length > MAX_SIGNAL_PAYLOAD) {
			throw new Error("Signal payload too large");
		}

		// Both sender and recipient must have canvas access
		await checkCanvasAccess(ctx, args.canvasId, user.uuid, "viewer");
		try {
			await checkCanvasAccess(ctx, args.canvasId, args.toUserId, "viewer");
		} catch {
			throw new Error("Recipient has no canvas access");
		}

		await ctx.db.insert("signalingMessages", {
			canvasId: args.canvasId,
			fromUserId: user.uuid,
			toUserId: args.toUserId,
			type: args.type,
			payload: args.payload,
			createdAt: Date.now(),
		});
	},
});

/** Get pending signaling messages for the current user on a canvas */
export const getSignals = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		return ctx.db
			.query("signalingMessages")
			.withIndex("by_canvas_recipient", (q) =>
				q.eq("canvasId", args.canvasId).eq("toUserId", user.uuid),
			)
			.collect();
	},
});

/** Delete a consumed signaling message */
export const consumeSignal = mutation({
	args: { signalId: v.id("signalingMessages") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);
		const signal = await ctx.db.get(args.signalId);
		if (!signal) return;
		// Only the recipient can consume their own signals
		if (signal.toUserId !== user.uuid) return;
		await ctx.db.delete(args.signalId);
	},
});

/** Clean up stale signaling messages (older than 5 minutes) */
export const cleanupStaleSignals = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - 5 * 60 * 1000;
		const stale = await ctx.db
			.query("signalingMessages")
			.withIndex("by_created", (q) => q.lt("createdAt", cutoff))
			.collect();

		for (const signal of stale) {
			await ctx.db.delete(signal._id);
		}

		return { cleaned: stale.length };
	},
});
