import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { getAuthenticatedUser } from "./users";
import { areFriends } from "./friendships";

/** Canvas bounds — objects must stay within these limits */
const CANVAS_MAX_X = 3000;
const CANVAS_MAX_Y = 2000;
const MAX_OBJECT_SIZE = 1000;
const MAX_TEXT_LENGTH = 5000;
const MAX_TITLE_LENGTH = 200;

/** Validate position is within canvas bounds */
function validatePosition(position: { x: number; y: number }) {
	if (position.x < 0 || position.x > CANVAS_MAX_X || position.y < 0 || position.y > CANVAS_MAX_Y) {
		throw new Error(`Position must be within canvas bounds (0–${CANVAS_MAX_X}, 0–${CANVAS_MAX_Y})`);
	}
}

/** Check if a user has access to a canvas (owner, member, viewer, or friend) */
async function checkCanvasAccess(ctx: any, canvasId: any, userUuid: string, minRole: "viewer" | "member" | "owner" = "viewer") {
	const canvas = await ctx.db.get(canvasId);
	if (!canvas) throw new Error("Canvas not found");

	// Owner always has full access
	if (canvas.ownerId === userUuid) return { canvas, role: "owner" as const };

	// Check canvasAccess table for explicitly shared canvases
	const access = await ctx.db
		.query("canvasAccess")
		.withIndex("by_canvas_user", (q: any) => q.eq("canvasId", canvasId).eq("userId", userUuid))
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

/** Content validator for textblock type */
const textblockContent = v.object({
	text: v.string(),
	color: v.number(),
});

/** Content validator for beacon type */
const beaconContent = v.object({
	title: v.string(),
	description: v.optional(v.string()),
	locationAddress: v.optional(v.string()),
	startTime: v.number(),
	endTime: v.number(),
	visibilityType: v.union(v.literal("direct"), v.literal("canvas")),
	directRecipients: v.optional(v.array(v.string())),
	directBeaconGroupId: v.optional(v.string()),
});

/** Get all objects on a canvas (auth + access check) */
export const getByCanvas = query({
	args: { canvasId: v.id("canvases") },
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
		if (!authUser) return [];

		const user = await ctx.db
			.query("users")
			.withIndex("by_auth_account", (q) => q.eq("authAccountId", authUser._id))
			.first();
		if (!user) return [];

		const canvas = await ctx.db.get(args.canvasId);
		if (!canvas) return [];

		// Check access: owner, canvasAccess entry, or friend (for personal canvases)
		if (canvas.ownerId !== user.uuid) {
			const access = await ctx.db
				.query("canvasAccess")
				.withIndex("by_canvas_user", (q) => q.eq("canvasId", args.canvasId).eq("userId", user.uuid))
				.first();
			if (!access) {
				// Check if this is a friend's personal canvas
				if (canvas.type !== "personal" || !(await areFriends(ctx, user.uuid, canvas.ownerId))) {
					return [];
				}
			}
		}

		return ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();
	},
});

/** Create a new canvas object (caller must have member+ access) */
export const create = mutation({
	args: {
		canvasId: v.id("canvases"),
		creatorId: v.string(),
		type: v.union(v.literal("textblock"), v.literal("beacon")),
		position: v.object({ x: v.number(), y: v.number() }),
		size: v.object({ w: v.number(), h: v.number() }),
		content: v.union(textblockContent, beaconContent),
		expiresAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Validate bounds
		validatePosition(args.position);
		if (args.size.w <= 0 || args.size.w > MAX_OBJECT_SIZE || args.size.h <= 0 || args.size.h > MAX_OBJECT_SIZE) {
			throw new Error(`Object size must be between 1 and ${MAX_OBJECT_SIZE}`);
		}

		// Verify caller has member+ access to the canvas
		await checkCanvasAccess(ctx, args.canvasId, user.uuid, "member");

		// Type-specific validation
		if (args.type === "textblock") {
			const content = args.content as { text: string; color: number };
			if (!content.text || content.text.length < 1 || content.text.length > MAX_TEXT_LENGTH) {
				throw new Error(`Text must be 1–${MAX_TEXT_LENGTH} characters`);
			}
		} else if (args.type === "beacon") {
			const content = args.content as { title: string; startTime: number; endTime: number };
			if (!content.title || content.title.length < 1 || content.title.length > MAX_TITLE_LENGTH) {
				throw new Error(`Title must be 1–${MAX_TITLE_LENGTH} characters`);
			}
			if (content.startTime >= content.endTime) {
				throw new Error("Start time must be before end time");
			}
		}

		return ctx.db.insert("canvasObjects", {
			canvasId: args.canvasId,
			creatorId: user.uuid,
			type: args.type,
			position: args.position,
			size: args.size,
			content: args.content,
			expiresAt: args.expiresAt,
		});
	},
});

/** Update an object's position (caller must have member+ access) */
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

		await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "member");

		await ctx.db.patch(args.id, { position: args.position });
	},
});

/** Remove a canvas object (caller must have member+ access, or be the creator) */
export const remove = mutation({
	args: { id: v.id("canvasObjects") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");

		// Owner of canvas can always remove, creator can remove their own, members can remove their own
		const { role } = await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "member");
		if (role !== "owner" && obj.creatorId !== user.uuid) {
			throw new Error("Can only remove your own objects");
		}

		await ctx.db.delete(args.id);
	},
});
