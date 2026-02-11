import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

/** Verify the caller is authenticated and return their Astrophage user */
async function getAuthenticatedUser(ctx: any) {
	const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
	if (!authUser) throw new Error("Not authenticated");

	const user = await ctx.db
		.query("users")
		.withIndex("by_auth_account", (q: any) => q.eq("authAccountId", authUser._id))
		.first();
	if (!user) throw new Error("User not found");

	return user;
}

/** Get all objects on a canvas (only if caller owns it) */
export const getByCanvas = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		// For now, verify the caller owns the canvas
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) return [];

		const user = await ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", authUser._id))
			.first();
		if (!user) return [];

		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) return [];

		return ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();
	},
});

/** Create a new canvas object (caller must own the canvas) */
export const create = mutation({
	args: {
		canvasId: v.id("canvases"),
		creatorId: v.string(),
		type: v.string(),
		position: v.object({ x: v.number(), y: v.number() }),
		size: v.object({ w: v.number(), h: v.number() }),
		content: v.any(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Verify caller owns the canvas
		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Not authorized to add objects to this canvas");
		}

		// Force creatorId to the authenticated user's UUID (don't trust client input)
		return ctx.db.insert("canvasObjects", {
			canvasId: args.canvasId,
			creatorId: user.uuid,
			type: args.type,
			position: args.position,
			size: args.size,
			content: args.content,
		});
	},
});

/** Update an object's position (caller must own the canvas it's on) */
export const updatePosition = mutation({
	args: {
		id: v.id("canvasObjects"),
		position: v.object({ x: v.number(), y: v.number() }),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");

		const canvas = await ctx.db.get(obj.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Not authorized to modify objects on this canvas");
		}

		await ctx.db.patch(args.id, { position: args.position });
	},
});

/** Remove a canvas object (caller must own the canvas it's on) */
export const remove = mutation({
	args: { id: v.id("canvasObjects") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");

		const canvas = await ctx.db.get(obj.canvasId);
		if (!canvas || canvas.ownerId !== user.uuid) {
			throw new Error("Not authorized to delete objects on this canvas");
		}

		await ctx.db.delete(args.id);
	},
});
