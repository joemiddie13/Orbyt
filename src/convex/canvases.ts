import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { getAuthenticatedUser } from "./users";

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
			.withIndex("by_owner_type", (q) => q.eq("ownerId", args.ownerId).eq("type", "personal"))
			.first();
	},
});

/** Create a new shared canvas and invite friends */
export const createSharedCanvas = mutation({
	args: {
		name: v.string(),
		inviteUuids: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		if (args.name.length < 1 || args.name.length > 100) {
			throw new Error("Canvas name must be 1–100 characters");
		}

		const canvasId = await ctx.db.insert("canvases", {
			ownerId: user.uuid,
			name: args.name,
			type: "shared",
			bounds: { width: 3000, height: 2000 },
		});

		// Verify all friendships in parallel
		const friendshipResults = await Promise.all(
			args.inviteUuids.map(async (inviteeUuid) => {
				const [fwd, rev] = await Promise.all([
					ctx.db.query("friendships")
						.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", inviteeUuid))
						.filter((q) => q.eq(q.field("status"), "accepted"))
						.first(),
					ctx.db.query("friendships")
						.withIndex("by_pair", (q) => q.eq("requesterId", inviteeUuid).eq("receiverId", user.uuid))
						.filter((q) => q.eq(q.field("status"), "accepted"))
						.first(),
				]);
				return { inviteeUuid, isFriend: !!(fwd || rev) };
			})
		);

		// Grant access to verified friends in parallel
		await Promise.all(
			friendshipResults
				.filter((r) => r.isFriend)
				.map((r) => ctx.db.insert("canvasAccess", {
					canvasId,
					userId: r.inviteeUuid,
					role: "member",
					invitedBy: user.uuid,
					invitedAt: Date.now(),
				}))
		);

		return canvasId;
	},
});

/** Update the overlay mode for a canvas (owner only) */
export const updateOverlayMode = mutation({
	args: {
		canvasId: v.id("canvases"),
		overlayMode: v.union(v.literal("none"), v.literal("dots"), v.literal("lines")),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Only the canvas owner can change overlay mode");
		}

		await ctx.db.patch(args.canvasId, { overlayMode: args.overlayMode });
	},
});

/** Rename a canvas (owner only) */
export const renameCanvas = mutation({
	args: {
		canvasId: v.id("canvases"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);
		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Only the canvas owner can rename it");
		}
		const trimmed = args.name.trim();
		if (trimmed.length < 1 || trimmed.length > 100) {
			throw new Error("Name must be 1–100 characters");
		}
		await ctx.db.patch(args.canvasId, { name: trimmed });
	},
});

/** Delete a shared canvas and all associated data (owner only) */
export const deleteCanvas = mutation({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);
		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas) throw new Error("Canvas not found");
		if (canvas.ownerId !== user.uuid) throw new Error("Only the canvas owner can delete it");
		if (canvas.type === "personal") throw new Error("Cannot delete your personal Orbyt");

		// 1. Get all canvas objects
		const objects = await ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		// 2. Delete beacon responses + sticker reactions for each object
		await Promise.all(
			objects.map(async (obj) => {
				const [responses, stickers] = await Promise.all([
					ctx.db.query("beaconResponses")
						.withIndex("by_beacon", (q) => q.eq("beaconId", obj._id))
						.collect(),
					ctx.db.query("stickerReactions")
						.withIndex("by_object", (q) => q.eq("objectId", obj._id))
						.collect(),
				]);
				await Promise.all([
					...responses.map((r) => ctx.db.delete(r._id)),
					...stickers.map((s) => ctx.db.delete(s._id)),
				]);
			})
		);

		// 3. Delete all canvas objects
		await Promise.all(objects.map((obj) => ctx.db.delete(obj._id)));

		// 4. Delete all access records
		const accessRecords = await ctx.db
			.query("canvasAccess")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();
		await Promise.all(accessRecords.map((r) => ctx.db.delete(r._id)));

		// 5. Delete all presence records
		const presenceRecords = await ctx.db
			.query("canvasPresence")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();
		await Promise.all(presenceRecords.map((r) => ctx.db.delete(r._id)));

		// 6. Delete signaling messages (query by canvasId prefix of compound index)
		const signals = await ctx.db
			.query("signalingMessages")
			.withIndex("by_canvas_recipient", (q) => q.eq("canvasId", args.canvasId))
			.collect();
		await Promise.all(signals.map((s) => ctx.db.delete(s._id)));

		// 7. Delete the canvas itself
		await ctx.db.delete(args.canvasId);
	},
});

/** One-time backfill: rename personal canvases from "'s canvas" to "'s Orbyt" */
export const backfillCanvasToOrbyt = internalMutation({
	args: {},
	handler: async (ctx) => {
		const canvases = await ctx.db
			.query("canvases")
			.filter((q) => q.eq(q.field("type"), "personal"))
			.collect();

		let updated = 0;
		for (const canvas of canvases) {
			if (canvas.name.endsWith("'s canvas")) {
				const newName = canvas.name.replace(/'s canvas$/, "'s Orbyt");
				await ctx.db.patch(canvas._id, { name: newName });
				updated++;
			}
		}
		return { total: canvases.length, updated };
	},
});
