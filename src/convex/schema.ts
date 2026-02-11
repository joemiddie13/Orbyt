import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		uuid: v.string(),
		authAccountId: v.string(),
		username: v.string(),
		displayName: v.string(),
		avatarUrl: v.optional(v.string()),
		email: v.optional(v.string()),
	})
		.index("by_uuid", ["uuid"])
		.index("by_username", ["username"])
		.index("by_auth_account", ["authAccountId"]),

	canvases: defineTable({
		ownerId: v.string(), // UUID, not Convex _id — portable for AT Protocol
		name: v.string(),
		type: v.union(v.literal("personal"), v.literal("shared"), v.literal("public")),
		bounds: v.object({
			width: v.number(),
			height: v.number(),
		}),
	}).index("by_owner", ["ownerId"]),

	canvasObjects: defineTable({
		canvasId: v.id("canvases"),
		creatorId: v.string(), // UUID, not Convex _id
		type: v.union(v.literal("textblock")),
		position: v.object({
			x: v.number(),
			y: v.number(),
		}),
		size: v.object({
			w: v.number(),
			h: v.number(),
		}),
		content: v.object({
			text: v.string(),
			color: v.number(),
		}),
		expiresAt: v.optional(v.number()),
	}).index("by_canvas", ["canvasId"]),
});
