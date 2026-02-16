import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
			.withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
			.filter((q) => q.eq(q.field("type"), "personal"))
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
