import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";

const VALID_STICKER_TYPES = ['heart', 'fire', 'laugh', 'wave', 'star', '100', 'thumbs-up', 'eyes'];
/** Sticker positions are relative to parent object — bounded to reasonable range */
const MAX_STICKER_OFFSET = 500;

/** Add a sticker reaction to a canvas object */
export const addSticker = mutation({
	args: {
		objectId: v.id("canvasObjects"),
		stickerType: v.string(),
		position: v.object({ x: v.number(), y: v.number() }),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		if (!VALID_STICKER_TYPES.includes(args.stickerType)) {
			throw new Error("Invalid sticker type");
		}

		// Validate sticker position is within reasonable bounds (relative to parent object)
		if (
			Math.abs(args.position.x) > MAX_STICKER_OFFSET ||
			Math.abs(args.position.y) > MAX_STICKER_OFFSET
		) {
			throw new Error("Sticker position out of bounds");
		}

		// Verify the object exists and caller has canvas access
		const obj = await ctx.db.get(args.objectId);
		if (!obj) throw new Error("Object not found");
		await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "viewer");

		// Limit stickers per user per object to prevent spam
		const MAX_STICKERS_PER_USER = 5;
		const existingStickers = await ctx.db
			.query("stickerReactions")
			.withIndex("by_object", (q) => q.eq("objectId", args.objectId))
			.take(100);
		const userStickers = existingStickers.filter((s) => s.userId === user.uuid);
		if (userStickers.length >= MAX_STICKERS_PER_USER) {
			throw new Error(`Max ${MAX_STICKERS_PER_USER} stickers per object`);
		}

		// Cooldown: prevent rapid add/remove spam cycles (1 second between adds)
		const lastUserSticker = userStickers.sort((a, b) => b.createdAt - a.createdAt)[0];
		if (lastUserSticker && Date.now() - lastUserSticker.createdAt < 1000) {
			throw new Error("Adding stickers too fast — wait a moment");
		}

		return ctx.db.insert("stickerReactions", {
			objectId: args.objectId,
			userId: user.uuid,
			stickerType: args.stickerType,
			position: args.position,
			createdAt: Date.now(),
		});
	},
});

/** Remove your own sticker from an object */
export const removeSticker = mutation({
	args: { stickerId: v.id("stickerReactions") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const sticker = await ctx.db.get(args.stickerId);
		if (!sticker) throw new Error("Sticker not found");
		if (sticker.userId !== user.uuid) throw new Error("Can only remove your own stickers");

		await ctx.db.delete(args.stickerId);
	},
});

/** Get all stickers for objects on a canvas (batch query) */
export const getByCanvas = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		try {
			await checkCanvasAccess(ctx, args.canvasId, user.uuid, "viewer");
		} catch {
			return [];
		}

		// Get all objects on this canvas
		const objects = await ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		// Get all stickers for each object
		const allStickers = await Promise.all(
			objects.map((obj) =>
				ctx.db
					.query("stickerReactions")
					.withIndex("by_object", (q) => q.eq("objectId", obj._id))
					.collect()
			)
		);

		return allStickers.flat();
	},
});
