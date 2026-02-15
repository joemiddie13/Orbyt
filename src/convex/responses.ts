import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";

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

		// Verify caller has access to the beacon's canvas
		await checkCanvasAccess(ctx, beacon.canvasId, user.uuid, "viewer");

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

		// Verify the beacon exists and caller has canvas access
		const beacon = await ctx.db.get(args.beaconId);
		if (!beacon || beacon.type !== "beacon") {
			throw new Error("Beacon not found");
		}
		await checkCanvasAccess(ctx, beacon.canvasId, user.uuid, "viewer");

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

		// Verify caller has access to the beacon's canvas
		const beacon = await ctx.db.get(args.beaconId);
		if (!beacon) return [];
		try {
			await checkCanvasAccess(ctx, beacon.canvasId, user.uuid, "viewer");
		} catch {
			return [];
		}

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

/** Get responses for a direct beacon group (aggregates only from accessible copies) */
export const getByBeaconGroup = query({
	args: { directBeaconGroupId: v.string() },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Use index instead of full table scan
		const groupBeacons = await ctx.db
			.query("canvasObjects")
			.withIndex("by_beacon_group", (q) => q.eq("directBeaconGroupId", args.directBeaconGroupId))
			.collect();

		if (groupBeacons.length === 0) return [];

		// Filter to only beacons the caller can actually access (parallel check)
		const accessibleBeacons = (await Promise.all(
			groupBeacons.map(async (beacon) => {
				try {
					await checkCanvasAccess(ctx, beacon.canvasId, user.uuid, "viewer");
					return beacon;
				} catch {
					return null;
				}
			})
		)).filter((b): b is NonNullable<typeof b> => b !== null);
		if (accessibleBeacons.length === 0) return [];

		// Aggregate responses only from accessible beacons
		const allResponses = await Promise.all(
			accessibleBeacons.map((b) =>
				ctx.db
					.query("beaconResponses")
					.withIndex("by_beacon", (q) => q.eq("beaconId", b._id))
					.collect()
			)
		);

		// Dedupe by userId (keep latest response)
		const byUser = new Map<string, Doc<"beaconResponses">>();
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
