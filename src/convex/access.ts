import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

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

		// Verify target is a friend
		const forwardFriendship = await ctx.db
			.query("friendships")
			.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", args.targetUuid))
			.filter((q) => q.eq(q.field("status"), "accepted"))
			.first();
		const reverseFriendship = await ctx.db
			.query("friendships")
			.withIndex("by_pair", (q) => q.eq("requesterId", args.targetUuid).eq("receiverId", user.uuid))
			.filter((q) => q.eq(q.field("status"), "accepted"))
			.first();

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

/** Get all canvases accessible to the current user (personal + shared) */
export const getAccessibleCanvases = query({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Personal canvases (owned)
		const ownedCanvases = await ctx.db
			.query("canvases")
			.withIndex("by_owner", (q) => q.eq("ownerId", user.uuid))
			.collect();

		// Shared canvases (via canvasAccess)
		const accessRecords = await ctx.db
			.query("canvasAccess")
			.withIndex("by_user", (q) => q.eq("userId", user.uuid))
			.collect();

		const sharedCanvases = await Promise.all(
			accessRecords.map((record) => ctx.db.get(record.canvasId))
		);

		return [
			...ownedCanvases.map((c) => ({ ...c, role: "owner" as const })),
			...sharedCanvases
				.filter(Boolean)
				.map((c, i) => ({ ...c!, role: accessRecords[i].role })),
		];
	},
});
