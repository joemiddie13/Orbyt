import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

/** Canvas bounds — objects must stay within these limits */
const CANVAS_MAX_X = 3000;
const CANVAS_MAX_Y = 2000;
const MAX_OBJECT_SIZE = 1000;
const MAX_TEXT_LENGTH = 5000;

/** Validate position is within canvas bounds */
function validatePosition(position: { x: number; y: number }) {
	if (position.x < 0 || position.x > CANVAS_MAX_X || position.y < 0 || position.y > CANVAS_MAX_Y) {
		throw new Error(`Position must be within canvas bounds (0–${CANVAS_MAX_X}, 0–${CANVAS_MAX_Y})`);
	}
}

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
		type: v.union(v.literal("textblock")),
		position: v.object({ x: v.number(), y: v.number() }),
		size: v.object({ w: v.number(), h: v.number() }),
		content: v.object({ text: v.string(), color: v.number() }),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Validate bounds and content
		validatePosition(args.position);
		if (args.size.w <= 0 || args.size.w > MAX_OBJECT_SIZE || args.size.h <= 0 || args.size.h > MAX_OBJECT_SIZE) {
			throw new Error(`Object size must be between 1 and ${MAX_OBJECT_SIZE}`);
		}
		if (args.content.text.length < 1 || args.content.text.length > MAX_TEXT_LENGTH) {
			throw new Error(`Text must be 1–${MAX_TEXT_LENGTH} characters`);
		}

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
		validatePosition(args.position);

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
