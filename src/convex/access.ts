import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./users";
import { areFriends } from "./friendships";

/** Check if a user has access to a canvas (owner, member, viewer, or friend) */
export async function checkCanvasAccess(ctx: QueryCtx | MutationCtx, canvasId: Id<"canvases">, userUuid: string, minRole: "viewer" | "member" | "owner" = "viewer") {
	const canvas = await ctx.db.get(canvasId);
	if (!canvas) throw new Error("Canvas not found");

	// Owner always has full access
	if (canvas.ownerId === userUuid) return { canvas, role: "owner" as const };

	// Check canvasAccess table for explicitly shared canvases
	const access = await ctx.db
		.query("canvasAccess")
		.withIndex("by_canvas_user", (q) => q.eq("canvasId", canvasId).eq("userId", userUuid))
		.first();

	if (access) {
		const roleHierarchy: Record<string, number> = { viewer: 0, member: 1, owner: 2 };
		if ((roleHierarchy[access.role] ?? 0) < (roleHierarchy[minRole] ?? 0)) {
			throw new Error(`Requires ${minRole} access`);
		}
		return { canvas, role: access.role };
	}

	// Friends get viewer access to personal canvases
	if (canvas.type === "personal" && minRole === "viewer") {
		const friends = await areFriends(ctx, userUuid, canvas.ownerId);
		if (friends) return { canvas, role: "viewer" as const };
	}

	throw new Error("Not authorized to access this canvas");
}

/** Grant a user access to a canvas */
export const grantAccess = mutation({
	args: {
		canvasId: v.id("canvases"),
		targetUuid: v.string(),
		role: v.union(v.literal("member"), v.literal("viewer")),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Only canvas owner can grant access
		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Only the canvas owner can invite people");
		}

		// Verify target is a friend (parallel lookup)
		const [forwardFriendship, reverseFriendship] = await Promise.all([
			ctx.db.query("friendships")
				.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", args.targetUuid))
				.filter((q) => q.eq(q.field("status"), "accepted"))
				.first(),
			ctx.db.query("friendships")
				.withIndex("by_pair", (q) => q.eq("requesterId", args.targetUuid).eq("receiverId", user.uuid))
				.filter((q) => q.eq(q.field("status"), "accepted"))
				.first(),
		]);

		if (!forwardFriendship && !reverseFriendship) {
			throw new Error("Can only invite connected friends");
		}

		// Check if access already exists
		const existing = await ctx.db
			.query("canvasAccess")
			.withIndex("by_canvas_user", (q) => q.eq("canvasId", args.canvasId).eq("userId", args.targetUuid))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { role: args.role });
			return existing._id;
		}

		return ctx.db.insert("canvasAccess", {
			canvasId: args.canvasId,
			userId: args.targetUuid,
			role: args.role,
			invitedBy: user.uuid,
			invitedAt: Date.now(),
		});
	},
});

/** Revoke a user's access to a canvas */
export const revokeAccess = mutation({
	args: {
		canvasId: v.id("canvases"),
		targetUuid: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Only the canvas owner can remove people");
		}

		const access = await ctx.db
			.query("canvasAccess")
			.withIndex("by_canvas_user", (q) => q.eq("canvasId", args.canvasId).eq("userId", args.targetUuid))
			.first();

		if (access) {
			await ctx.db.delete(access._id);
		}
	},
});

/** Get all members of a canvas (with display names) */
export const getCanvasMembers = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Verify caller has access to this canvas
		try {
			await checkCanvasAccess(ctx, args.canvasId, user.uuid, "viewer");
		} catch {
			return [];
		}

		const accessRecords = await ctx.db
			.query("canvasAccess")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		const members = await Promise.all(
			accessRecords.map(async (record) => {
				const member = await ctx.db
					.query("users")
					.withIndex("by_uuid", (q) => q.eq("uuid", record.userId))
					.first();
				return member
					? {
							uuid: member.uuid,
							username: member.username,
							displayName: member.displayName,
							role: record.role,
					  }
					: null;
			})
		);

		// Include canvas owner
		const canvas = await ctx.db.get(args.canvasId);
		if (canvas) {
			const owner = await ctx.db
				.query("users")
				.withIndex("by_uuid", (q) => q.eq("uuid", canvas.ownerId))
				.first();
			if (owner) {
				members.unshift({
					uuid: owner.uuid,
					username: owner.username,
					displayName: owner.displayName,
					role: "owner" as const,
				});
			}
		}

		return members.filter(Boolean);
	},
});

/** Get all canvases accessible to the current user (personal + shared + friends') */
export const getAccessibleCanvases = query({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Run all independent queries in parallel
		const [ownedCanvases, accessRecords, asRequester, asReceiver] = await Promise.all([
			// Personal canvases (owned)
			ctx.db
				.query("canvases")
				.withIndex("by_owner", (q) => q.eq("ownerId", user.uuid))
				.collect(),
			// Shared canvases (via canvasAccess)
			ctx.db
				.query("canvasAccess")
				.withIndex("by_user", (q) => q.eq("userId", user.uuid))
				.collect(),
			// Friendships — compound index eliminates post-filter
			ctx.db
				.query("friendships")
				.withIndex("by_requester_status", (q) =>
					q.eq("requesterId", user.uuid).eq("status", "accepted")
				)
				.collect(),
			ctx.db
				.query("friendships")
				.withIndex("by_receiver_status", (q) =>
					q.eq("receiverId", user.uuid).eq("status", "accepted")
				)
				.collect(),
		]);

		// Resolve shared canvases + friend canvases in a single parallel batch
		const friendUuids = [
			...asRequester.map((f) => f.receiverId),
			...asReceiver.map((f) => f.requesterId),
		];

		const [sharedCanvases, ...friendCanvases] = await Promise.all([
			// Batch-fetch all shared canvases at once
			Promise.all(accessRecords.map((record) => ctx.db.get(record.canvasId))),
			// Fetch each friend's personal canvas
			...friendUuids.map((uuid) =>
				ctx.db
					.query("canvases")
					.withIndex("by_owner", (q) => q.eq("ownerId", uuid))
					.filter((q) => q.eq(q.field("type"), "personal"))
					.first()
			),
		]);

		return [
			...ownedCanvases.map((c) => ({ ...c, role: "owner" as const })),
			...sharedCanvases
				.filter(Boolean)
				.map((c, i) => ({ ...c!, role: accessRecords[i].role })),
			...friendCanvases
				.filter(Boolean)
				.map((c) => ({ ...c!, role: "viewer" as const })),
		];
	},
});
