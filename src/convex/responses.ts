import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/** Respond to a beacon (upsert — replaces existing response) */
export const respond = mutation({
	args: {
		beaconId: v.id("canvasObjects"),
		status: v.union(v.literal("joining"), v.literal("interested"), v.literal("declined")),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Verify the beacon exists and is a beacon type
		const beacon = await ctx.db.get(args.beaconId);
		if (!beacon || beacon.type !== "beacon") {
			throw new Error("Beacon not found");
		}

		// Check for existing response (upsert)
		const existing = await ctx.db
			.query("beaconResponses")
			.withIndex("by_beacon_user", (q) => q.eq("beaconId", args.beaconId).eq("userId", user.uuid))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				status: args.status,
				respondedAt: Date.now(),
			});
			return existing._id;
		}

		return ctx.db.insert("beaconResponses", {
			beaconId: args.beaconId,
			userId: user.uuid,
			status: args.status,
			respondedAt: Date.now(),
		});
	},
});

/** Remove your response from a beacon */
export const removeResponse = mutation({
	args: { beaconId: v.id("canvasObjects") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const existing = await ctx.db
			.query("beaconResponses")
			.withIndex("by_beacon_user", (q) => q.eq("beaconId", args.beaconId).eq("userId", user.uuid))
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Get all responses for a beacon (with display names) */
export const getByBeacon = query({
	args: { beaconId: v.id("canvasObjects") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		const responses = await ctx.db
			.query("beaconResponses")
			.withIndex("by_beacon", (q) => q.eq("beaconId", args.beaconId))
			.collect();

		const results = await Promise.all(
			responses.map(async (resp) => {
				const responder = await ctx.db
					.query("users")
					.withIndex("by_uuid", (q) => q.eq("uuid", resp.userId))
					.first();
				return {
					...resp,
					displayName: responder?.displayName ?? "Unknown",
					username: responder?.username ?? "unknown",
				};
			})
		);

		return results;
	},
});

/** Get responses for a direct beacon group (aggregates across copies) */
export const getByBeaconGroup = query({
	args: { directBeaconGroupId: v.string() },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Find all beacon objects sharing this group ID
		// We need to scan canvasObjects for matching directBeaconGroupId
		const allObjects = await ctx.db.query("canvasObjects").collect();
		const groupBeacons = allObjects.filter((obj) => {
			if (obj.type !== "beacon") return false;
			const content = obj.content as any;
			return content.directBeaconGroupId === args.directBeaconGroupId;
		});

		const beaconIds = groupBeacons.map((b) => b._id);

		// Aggregate responses across all copies
		const allResponses = await Promise.all(
			beaconIds.map((id) =>
				ctx.db
					.query("beaconResponses")
					.withIndex("by_beacon", (q) => q.eq("beaconId", id))
					.collect()
			)
		);

		// Dedupe by userId (keep latest response)
		const byUser = new Map<string, any>();
		for (const responses of allResponses) {
			for (const resp of responses) {
				const existing = byUser.get(resp.userId);
				if (!existing || resp.respondedAt > existing.respondedAt) {
					byUser.set(resp.userId, resp);
				}
			}
		}

		const results = await Promise.all(
			[...byUser.values()].map(async (resp) => {
				const responder = await ctx.db
					.query("users")
					.withIndex("by_uuid", (q) => q.eq("uuid", resp.userId))
					.first();
				return {
					...resp,
					displayName: responder?.displayName ?? "Unknown",
					username: responder?.username ?? "unknown",
				};
			})
		);

		return results;
	},
});
