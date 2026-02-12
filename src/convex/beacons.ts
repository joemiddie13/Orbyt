import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/** Get active (non-expired) beacons on a canvas */
export const getActiveBeacons = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		const objects = await ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		return objects.filter(
			(obj) => obj.type === "beacon" && (!obj.expiresAt || obj.expiresAt > Date.now())
		);
	},
});

/** Clean up expired beacons and their associated data */
export const cleanupExpired = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		// Find all expired beacon objects
		const allObjects = await ctx.db.query("canvasObjects").collect();
		const expiredBeacons = allObjects.filter(
			(obj) => obj.type === "beacon" && obj.expiresAt && obj.expiresAt < now
		);

		for (const beacon of expiredBeacons) {
			// Delete associated responses
			const responses = await ctx.db
				.query("beaconResponses")
				.withIndex("by_beacon", (q) => q.eq("beaconId", beacon._id))
				.collect();
			for (const resp of responses) {
				await ctx.db.delete(resp._id);
			}

			// Delete associated stickers
			const stickers = await ctx.db
				.query("stickerReactions")
				.withIndex("by_object", (q) => q.eq("objectId", beacon._id))
				.collect();
			for (const sticker of stickers) {
				await ctx.db.delete(sticker._id);
			}

			// Delete the beacon itself
			await ctx.db.delete(beacon._id);
		}

		return { cleaned: expiredBeacons.length };
	},
});

/** Create a direct beacon — places copies on each recipient's personal canvas */
export const createDirectBeacon = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		locationAddress: v.optional(v.string()),
		startTime: v.number(),
		endTime: v.number(),
		recipientUuids: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		if (args.title.length < 1 || args.title.length > 200) {
			throw new Error("Title must be 1–200 characters");
		}
		if (args.startTime >= args.endTime) {
			throw new Error("Start time must be before end time");
		}
		if (args.recipientUuids.length === 0) {
			throw new Error("Must have at least one recipient");
		}

		const groupId = crypto.randomUUID();

		// Validate all recipients are friends
		for (const recipientUuid of args.recipientUuids) {
			const fwd = await ctx.db
				.query("friendships")
				.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", recipientUuid))
				.filter((q) => q.eq(q.field("status"), "accepted"))
				.first();
			const rev = await ctx.db
				.query("friendships")
				.withIndex("by_pair", (q) => q.eq("requesterId", recipientUuid).eq("receiverId", user.uuid))
				.filter((q) => q.eq(q.field("status"), "accepted"))
				.first();
			if (!fwd && !rev) throw new Error("Can only send beacons to friends");
		}

		const beaconContent = {
			title: args.title,
			description: args.description,
			locationAddress: args.locationAddress,
			startTime: args.startTime,
			endTime: args.endTime,
			visibilityType: "direct" as const,
			directRecipients: args.recipientUuids,
			directBeaconGroupId: groupId,
		};

		const createdIds: string[] = [];

		// Place on each recipient's personal canvas
		for (const recipientUuid of args.recipientUuids) {
			const personalCanvas = await ctx.db
				.query("canvases")
				.withIndex("by_owner", (q) => q.eq("ownerId", recipientUuid))
				.filter((q) => q.eq(q.field("type"), "personal"))
				.first();

			if (personalCanvas) {
				const id = await ctx.db.insert("canvasObjects", {
					canvasId: personalCanvas._id,
					creatorId: user.uuid,
					type: "beacon",
					position: { x: 300 + Math.random() * 500, y: 200 + Math.random() * 400 },
					size: { w: 260, h: 100 },
					content: beaconContent,
					expiresAt: args.endTime,
				});
				createdIds.push(id);
			}
		}

		// Also place on the creator's own personal canvas
		const myCanvas = await ctx.db
			.query("canvases")
			.withIndex("by_owner", (q) => q.eq("ownerId", user.uuid))
			.filter((q) => q.eq(q.field("type"), "personal"))
			.first();

		if (myCanvas) {
			const id = await ctx.db.insert("canvasObjects", {
				canvasId: myCanvas._id,
				creatorId: user.uuid,
				type: "beacon",
				position: { x: 300 + Math.random() * 500, y: 200 + Math.random() * 400 },
				size: { w: 260, h: 100 },
				content: beaconContent,
				expiresAt: args.endTime,
			});
			createdIds.push(id);
		}

		return { groupId, createdIds };
	},
});
