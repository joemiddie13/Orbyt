import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";
import { validatePosition, MAX_CAPTION_LENGTH } from "./validators";

/** Max file size: 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Generate a one-time upload URL for Convex file storage */
export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await getAuthenticatedUser(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

/** Create a photo canvas object after upload completes */
export const createPhoto = mutation({
	args: {
		canvasId: v.id("canvases"),
		storageId: v.string(),
		position: v.object({ x: v.number(), y: v.number() }),
		caption: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);
		await checkCanvasAccess(ctx, args.canvasId, user.uuid, "member");

		validatePosition(args.position);

		// Validate the storage ID refers to a real file
		const metadata = await ctx.storage.getMetadata(args.storageId as Id<"_storage">);
		if (!metadata) throw new Error("Invalid storage ID");
		if (metadata.size > MAX_FILE_SIZE) {
			throw new Error("File too large (max 5MB)");
		}

		// Validate file type server-side (don't trust client Content-Type)
		if (!metadata.contentType || !ALLOWED_IMAGE_TYPES.includes(metadata.contentType)) {
			throw new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`);
		}

		if (args.caption && args.caption.length > MAX_CAPTION_LENGTH) {
			throw new Error(`Caption must be ${MAX_CAPTION_LENGTH} characters or less`);
		}

		// Random polaroid tilt: -5 to +5 degrees
		const rotation = (Math.random() - 0.5) * 10;

		return ctx.db.insert("canvasObjects", {
			canvasId: args.canvasId,
			creatorId: user.uuid,
			type: "photo",
			position: args.position,
			size: { w: 260, h: 300 },
			content: {
				storageId: args.storageId,
				caption: args.caption,
				rotation,
			},
		});
	},
});

/** Update a photo's caption */
export const updateCaption = mutation({
	args: {
		id: v.id("canvasObjects"),
		caption: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const obj = await ctx.db.get(args.id);
		if (!obj) throw new Error("Object not found");
		if (obj.type !== "photo") throw new Error("Not a photo object");

		await checkCanvasAccess(ctx, obj.canvasId, user.uuid, "member");

		if (args.caption.length > MAX_CAPTION_LENGTH) {
			throw new Error(`Caption must be ${MAX_CAPTION_LENGTH} characters or less`);
		}

		const content = obj.content as { storageId: string; caption?: string; rotation: number };
		await ctx.db.patch(args.id, {
			content: { ...content, caption: args.caption },
		});
	},
});
