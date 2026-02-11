import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Get all objects on a canvas */
export const getByCanvas = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		return ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();
	},
});

/** Create a new canvas object */
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
		return ctx.db.insert("canvasObjects", {
			canvasId: args.canvasId,
			creatorId: args.creatorId,
			type: args.type,
			position: args.position,
			size: args.size,
			content: args.content,
		});
	},
});

/** Update an object's position (after drag-and-drop) */
export const updatePosition = mutation({
	args: {
		id: v.id("canvasObjects"),
		position: v.object({ x: v.number(), y: v.number() }),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { position: args.position });
	},
});

/** Remove a canvas object */
export const remove = mutation({
	args: { id: v.id("canvasObjects") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});
