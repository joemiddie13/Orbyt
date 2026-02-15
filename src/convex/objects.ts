import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { getAuthenticatedUser } from "./users";
import { areFriends } from "./friendships";
import { checkCanvasAccess } from "./access";

/** Canvas bounds — objects must stay within these limits */
const CANVAS_MAX_X = 3000;
const CANVAS_MAX_Y = 2000;
const MAX_OBJECT_SIZE = 1000;
const MAX_TEXT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 200;

/** Validate position is within canvas bounds */
function validatePosition(position: { x: number; y: number }) {
	if (position.x < 0 || position.x > CANVAS_MAX_X || position.y < 0 || position.y > CANVAS_MAX_Y) {
		throw new Error(`Position must be within canvas bounds (0–${CANVAS_MAX_X}, 0–${CANVAS_MAX_Y})`);
	}
}

/** Content validator for textblock type */
const textblockContent = v.object({
	text: v.string(),
	color: v.number(),
	title: v.optional(v.string()),
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

		const objects = await ctx.db
			.query("canvasObjects")
			.withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
			.collect();

		// Resolve storage URLs for photo objects
		return Promise.all(
			objects.map(async (obj) => {
				if (obj.type === "photo") {
					const content = obj.content as { storageId: string; caption?: string; rotation: number };
					const imageUrl = await ctx.storage.getUrl(content.storageId as any);
					return { ...obj, content: { ...content, imageUrl } };
				}
				return obj;
			})
		);
	},
});

/** Create a new canvas object (caller must have member+ access) */
export const create = mutation({
	args: {
		canvasId: v.id("canvases"),
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
			const content = args.content as { text: string; color: number; title?: string };
			if (!content.text || content.text.length < 1 || content.text.length > MAX_TEXT_LENGTH) {
				throw new Error(`Text must be 1–${MAX_TEXT_LENGTH} characters`);
			}
			if (content.title && content.title.length > 100) {
				throw new Error("Note title must be 100 characters or less");
			}
		} else if (args.type === "beacon") {
			const content = args.content as {
				title: string; description?: string; locationAddress?: string;
				startTime: number; endTime: number;
			};
			if (!content.title || content.title.length < 1 || content.title.length > MAX_TITLE_LENGTH) {
				throw new Error(`Title must be 1–${MAX_TITLE_LENGTH} characters`);
			}
			if (content.description && content.description.length > 1000) {
				throw new Error("Description must be 1000 characters or less");
			}
			if (content.locationAddress && content.locationAddress.length > 500) {
				throw new Error("Location must be 500 characters or less");
			}
			if (content.startTime >= content.endTime) {
				throw new Error("Start time must be before end time");
			}
			const now = Date.now();
			const MAX_BEACON_DURATION = 90 * 24 * 60 * 60 * 1000; // 90 days
			if (content.startTime < now - 60_000) {
				throw new Error("Start time cannot be in the past");
			}
			if (content.endTime - content.startTime > MAX_BEACON_DURATION) {
				throw new Error("Beacon duration cannot exceed 90 days");
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

/** Update a textblock's content (caller must have member+ access) */
export const updateContent = mutation({
	args: {
		id: v.id("canvasObjects"),
		content: textblockContent,
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");
		if (obj.type !== "textblock") throw new Error("Can only update textblock content");

		await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "member");

		if (!args.content.text || args.content.text.length < 1 || args.content.text.length > MAX_TEXT_LENGTH) {
			throw new Error(`Text must be 1–${MAX_TEXT_LENGTH} characters`);
		}
		if (args.content.title && args.content.title.length > 100) {
			throw new Error("Note title must be 100 characters or less");
		}

		await ctx.db.patch(args.id, { content: args.content });
	},
});

/** Update an object's size (caller must have member+ access) */
export const updateSize = mutation({
	args: {
		id: v.id("canvasObjects"),
		size: v.object({ w: v.number(), h: v.number() }),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");

		await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "member");

		if (args.size.w <= 0 || args.size.w > MAX_OBJECT_SIZE || args.size.h <= 0 || args.size.h > MAX_OBJECT_SIZE) {
			throw new Error(`Object size must be between 1 and ${MAX_OBJECT_SIZE}`);
		}

		await ctx.db.patch(args.id, { size: args.size });
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

		// Cascade delete associated data (responses + stickers)
		const [responses, stickers] = await Promise.all([
			ctx.db.query("beaconResponses")
				.withIndex("by_beacon", (q) => q.eq("beaconId", args.id))
				.collect(),
			ctx.db.query("stickerReactions")
				.withIndex("by_object", (q) => q.eq("objectId", args.id))
				.collect(),
		]);
		await Promise.all([
			...responses.map((r) => ctx.db.delete(r._id)),
			...stickers.map((s) => ctx.db.delete(s._id)),
		]);

		await ctx.db.delete(args.id);
	},
});
