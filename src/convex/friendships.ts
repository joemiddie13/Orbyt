import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/** Check if two users are friends (accepted friendship in either direction) */
export async function areFriends(ctx: any, uuidA: string, uuidB: string): Promise<boolean> {
	const forward = await ctx.db
		.query("friendships")
		.withIndex("by_pair", (q: any) => q.eq("requesterId", uuidA).eq("receiverId", uuidB))
		.filter((q: any) => q.eq(q.field("status"), "accepted"))
		.first();
	if (forward) return true;

	const reverse = await ctx.db
		.query("friendships")
		.withIndex("by_pair", (q: any) => q.eq("requesterId", uuidB).eq("receiverId", uuidA))
		.filter((q: any) => q.eq(q.field("status"), "accepted"))
		.first();
	return !!reverse;
}

/** Send a friend request by entering someone's friend code */
export const sendRequest = mutation({
	args: { friendCode: v.string() },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		// Look up the target user by friend code
		const target = await ctx.db
			.query("users")
			.withIndex("by_friend_code", (q) => q.eq("friendCode", args.friendCode))
			.first();

		if (!target) throw new Error("No user found with that friend code");
		if (target.uuid === user.uuid) throw new Error("Can't add yourself");

		// Check if a friendship already exists in either direction
		const existingForward = await ctx.db
			.query("friendships")
			.withIndex("by_pair", (q) => q.eq("requesterId", user.uuid).eq("receiverId", target.uuid))
			.first();
		if (existingForward) {
			if (existingForward.status === "accepted") throw new Error("Already friends");
			if (existingForward.status === "pending") throw new Error("Request already sent");
			// If declined, allow re-requesting by updating status
			await ctx.db.patch(existingForward._id, { status: "pending", createdAt: Date.now() });
			return existingForward._id;
		}

		const existingReverse = await ctx.db
			.query("friendships")
			.withIndex("by_pair", (q) => q.eq("requesterId", target.uuid).eq("receiverId", user.uuid))
			.first();
		if (existingReverse) {
			if (existingReverse.status === "accepted") throw new Error("Already friends");
			if (existingReverse.status === "pending") {
				// They already sent us a request — auto-accept
				await ctx.db.patch(existingReverse._id, { status: "accepted" });
				return existingReverse._id;
			}
		}

		return ctx.db.insert("friendships", {
			requesterId: user.uuid,
			receiverId: target.uuid,
			status: "pending",
			createdAt: Date.now(),
		});
	},
});

/** Accept a pending friend request */
export const acceptRequest = mutation({
	args: { friendshipId: v.id("friendships") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const friendship = await ctx.db.get(args.friendshipId);
		if (!friendship) throw new Error("Request not found");
		if (friendship.receiverId !== user.uuid) throw new Error("Not your request to accept");
		if (friendship.status !== "pending") throw new Error("Request is not pending");

		await ctx.db.patch(args.friendshipId, { status: "accepted" });
	},
});

/** Decline a pending friend request */
export const declineRequest = mutation({
	args: { friendshipId: v.id("friendships") },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);

		const friendship = await ctx.db.get(args.friendshipId);
		if (!friendship) throw new Error("Request not found");
		if (friendship.receiverId !== user.uuid) throw new Error("Not your request to decline");
		if (friendship.status !== "pending") throw new Error("Request is not pending");

		await ctx.db.patch(args.friendshipId, { status: "declined" });
	},
});

/** Get all accepted friends for the current user (with display names) */
export const getFriends = query({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		// Get friendships where user is requester or receiver
		const asRequester = await ctx.db
			.query("friendships")
			.withIndex("by_requester", (q) => q.eq("requesterId", user.uuid))
			.filter((q) => q.eq(q.field("status"), "accepted"))
			.collect();

		const asReceiver = await ctx.db
			.query("friendships")
			.withIndex("by_receiver", (q) => q.eq("receiverId", user.uuid))
			.filter((q) => q.eq(q.field("status"), "accepted"))
			.collect();

		// Resolve friend UUIDs to user records
		const friendUuids = [
			...asRequester.map((f) => f.receiverId),
			...asReceiver.map((f) => f.requesterId),
		];

		const friends = await Promise.all(
			friendUuids.map((uuid) =>
				ctx.db.query("users").withIndex("by_uuid", (q) => q.eq("uuid", uuid)).first()
			)
		);

		return friends.filter(Boolean).map((f) => ({
			uuid: f!.uuid,
			username: f!.username,
			displayName: f!.displayName,
			avatarUrl: f!.avatarUrl,
		}));
	},
});

/** Get pending friend requests received by the current user */
export const getPendingRequests = query({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx).catch(() => null);
		if (!user) return [];

		const pending = await ctx.db
			.query("friendships")
			.withIndex("by_receiver", (q) => q.eq("receiverId", user.uuid))
			.filter((q) => q.eq(q.field("status"), "pending"))
			.collect();

		// Resolve requester UUIDs to user records
		const results = await Promise.all(
			pending.map(async (req) => {
				const requester = await ctx.db
					.query("users")
					.withIndex("by_uuid", (q) => q.eq("uuid", req.requesterId))
					.first();
				return requester
					? {
							friendshipId: req._id,
							username: requester.username,
							displayName: requester.displayName,
							uuid: requester.uuid,
					  }
					: null;
			})
		);

		return results.filter(Boolean);
	},
});
