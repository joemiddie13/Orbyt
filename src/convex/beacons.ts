import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";

/** Get active (non-expired) beacons on a canvas */
export const getActiveBeacons = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		try {
			await checkCanvasAccess(ctx, args.canvasId, user.uuid, "viewer");
		} catch {
			return [];
		}

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

		// Use compound index to find expired beacons efficiently
		const expiredBeacons = await ctx.db
			.query("canvasObjects")
			.withIndex("by_type_expires", (q) => q.eq("type", "beacon").lt("expiresAt", now))
			.collect();

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

/** One-time backfill: copy content.directBeaconGroupId to top-level field for index */
export const backfillBeaconGroupIds = internalMutation({
	args: {},
	handler: async (ctx) => {
		const beacons = await ctx.db
			.query("canvasObjects")
			.withIndex("by_type_expires", (q) => q.eq("type", "beacon"))
			.collect();

		let patched = 0;
		for (const beacon of beacons) {
			if (beacon.directBeaconGroupId) continue; // already has it
			const content = beacon.content as any;
			if (content.directBeaconGroupId) {
				await ctx.db.patch(beacon._id, {
					directBeaconGroupId: content.directBeaconGroupId,
				});
				patched++;
			}
		}
		return { patched };
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

		// Rate limit: max 10 direct beacons per user per hour
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const recentBeacons = await ctx.db
			.query("canvasObjects")
			.withIndex("by_creator", (q) => q.eq("creatorId", user.uuid))
			.filter((q) =>
				q.and(
					q.eq(q.field("type"), "beacon"),
					q.gt(q.field("_creationTime"), oneHourAgo)
				)
			)
			.collect();
		// Each direct beacon creates N+1 copies (recipients + self), so count unique groupIds
		const uniqueGroups = new Set(recentBeacons.map((b) => b.directBeaconGroupId).filter(Boolean));
		if (uniqueGroups.size >= 10) {
			throw new Error("Rate limit: max 10 direct beacons per hour");
		}

		if (args.title.length < 1 || args.title.length > 200) {
			throw new Error("Title must be 1–200 characters");
		}
		if (args.description && args.description.length > 1000) {
			throw new Error("Description must be 1000 characters or less");
		}
		if (args.locationAddress && args.locationAddress.length > 500) {
			throw new Error("Location must be 500 characters or less");
		}
		if (args.startTime >= args.endTime) {
			throw new Error("Start time must be before end time");
		}
		const now = Date.now();
		const MAX_BEACON_DURATION = 90 * 24 * 60 * 60 * 1000; // 90 days
		if (args.startTime < now - 60_000) {
			throw new Error("Start time cannot be in the past");
		}
		if (args.endTime - args.startTime > MAX_BEACON_DURATION) {
			throw new Error("Beacon duration cannot exceed 90 days");
		}
		if (args.recipientUuids.length === 0) {
			throw new Error("Must have at least one recipient");
		}
		if (args.recipientUuids.length > 50) {
			throw new Error("Max 50 recipients per beacon");
		}

		const groupId = crypto.randomUUID();

		// Validate all recipients are friends (parallel)
		await Promise.all(args.recipientUuids.map(async (recipientUuid) => {
			const [fwd, rev] = await Promise.all([
				ctx.db.query("friendships")
					.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", recipientUuid))
					.filter((q) => q.eq(q.field("status"), "accepted"))
					.first(),
				ctx.db.query("friendships")
					.withIndex("by_pair", (q) => q.eq("requesterId", recipientUuid).eq("receiverId", user.uuid))
					.filter((q) => q.eq(q.field("status"), "accepted"))
					.first(),
			]);
			if (!fwd && !rev) throw new Error("Can only send beacons to friends");
		}));

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

		// Fetch all personal canvases in parallel (recipients + creator)
		const allUuids = [...args.recipientUuids, user.uuid];
		const personalCanvases = await Promise.all(
			allUuids.map((uuid) =>
				ctx.db.query("canvases")
					.withIndex("by_owner", (q) => q.eq("ownerId", uuid))
					.filter((q) => q.eq(q.field("type"), "personal"))
					.first()
			)
		);

		// Place beacon on each canvas that exists
		const createdIds: string[] = [];
		for (const canvas of personalCanvases) {
			if (canvas) {
				const id = await ctx.db.insert("canvasObjects", {
					canvasId: canvas._id,
					creatorId: user.uuid,
					type: "beacon",
					position: { x: 300 + Math.random() * 500, y: 200 + Math.random() * 400 },
					size: { w: 260, h: 100 },
					content: beaconContent,
					expiresAt: args.endTime,
					directBeaconGroupId: groupId,
				});
				createdIds.push(id);
			}
		}

		return { groupId, createdIds };
	},
});
