import { v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * AI Social Wellness Companion — powered by Claude Opus 4.6
 *
 * Gathers social graph data (friendships, beacons, responses, notes)
 * and asks Claude to generate a personalized wellness report.
 */

// ── Types ──

interface FriendInsight {
	name: string;
	emoji: string;
	status: "thriving" | "connected" | "drifting" | "new";
	insight: string;
	suggestion: string;
}

interface ActivitySuggestion {
	emoji: string;
	title: string;
	description: string;
	bestFor: string;
	timing: string;
}

interface CharityCause {
	emoji: string;
	cause: string;
	whyItFits: string;
	firstStep: string;
}

export interface WellnessReport {
	overallHealth: "thriving" | "connected" | "growing" | "needs-attention";
	healthScore: number;
	summary: string;
	friendInsights: FriendInsight[];
	activitySuggestions: ActivitySuggestion[];
	charityCause: CharityCause;
	weeklyNudge: string;
}

// ── Internal query: gather all social data for one user ──

export const gatherSocialData = internalQuery({
	args: { userUuid: v.string() },
	handler: async (ctx, args) => {
		const { userUuid } = args;

		// 1. Get user record
		const user = await ctx.db
			.query("users")
			.withIndex("by_uuid", (q) => q.eq("uuid", userUuid))
			.first();
		if (!user) throw new Error("User not found");

		// 2. Get accepted friendships (both directions, compound indexes)
		const [asRequester, asReceiver] = await Promise.all([
			ctx.db
				.query("friendships")
				.withIndex("by_requester_status", (q) =>
					q.eq("requesterId", userUuid).eq("status", "accepted")
				)
				.collect(),
			ctx.db
				.query("friendships")
				.withIndex("by_receiver_status", (q) =>
					q.eq("receiverId", userUuid).eq("status", "accepted")
				)
				.collect(),
		]);

		const friendUuids = [
			...asRequester.map((f) => f.receiverId),
			...asReceiver.map((f) => f.requesterId),
		];

		// 3. Resolve friend user records (parallel)
		const friends = await Promise.all(
			friendUuids.map((uuid) =>
				ctx.db
					.query("users")
					.withIndex("by_uuid", (q) => q.eq("uuid", uuid))
					.first()
			)
		);
		const friendData = friends.filter(Boolean).map((f) => ({
			uuid: f!.uuid,
			username: f!.username,
			displayName: f!.displayName,
		}));

		// 4. Get recent beacons created by user + friends (last 30 days)
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const allUuids = [userUuid, ...friendUuids];

		const recentBeacons = await Promise.all(
			allUuids.map(async (uuid) => {
				const objects = await ctx.db
					.query("canvasObjects")
					.withIndex("by_creator_type", (q) =>
						q.eq("creatorId", uuid).eq("type", "beacon")
					)
					.collect();
				return objects
					.filter((o) => o._creationTime > thirtyDaysAgo)
					.map((o) => ({
						id: o._id,
						creatorId: o.creatorId,
						title: (o.content as any).title as string,
						description: (o.content as any).description as string | undefined,
						startTime: (o.content as any).startTime as number,
						endTime: (o.content as any).endTime as number,
						createdAt: o._creationTime,
					}));
			})
		);
		const allBeacons = recentBeacons.flat();

		// 5. Get beacon responses for those beacons (parallel)
		const beaconResponses = await Promise.all(
			allBeacons.map(async (beacon) => {
				const responses = await ctx.db
					.query("beaconResponses")
					.withIndex("by_beacon", (q) => q.eq("beaconId", beacon.id as any))
					.collect();
				return {
					beaconId: beacon.id,
					beaconTitle: beacon.title,
					responses: responses.map((r) => ({
						userId: r.userId,
						status: r.status,
					})),
				};
			})
		);

		// 6. Get recent notes on user's personal canvas (interest signals)
		const personalCanvas = await ctx.db
			.query("canvases")
			.withIndex("by_owner_type", (q) =>
				q.eq("ownerId", userUuid).eq("type", "personal")
			)
			.first();

		let recentNotes: { text: string; title?: string }[] = [];
		if (personalCanvas) {
			const objects = await ctx.db
				.query("canvasObjects")
				.withIndex("by_canvas", (q) => q.eq("canvasId", personalCanvas._id))
				.collect();
			recentNotes = objects
				.filter((o) => o.type === "textblock" && o._creationTime > thirtyDaysAgo)
				.slice(0, 10)
				.map((o) => ({
					text: ((o.content as any).text as string)?.slice(0, 200) ?? "",
					title: (o.content as any).title as string | undefined,
				}));
		}

		// 7. Friendship creation dates (how long they've been friends)
		const friendshipDates = [...asRequester, ...asReceiver].map((f) => ({
			friendUuid: f.requesterId === userUuid ? f.receiverId : f.requesterId,
			since: f.createdAt,
		}));

		return {
			user: {
				username: user.username,
				displayName: user.displayName,
			},
			friends: friendData,
			friendshipDates,
			beacons: allBeacons,
			beaconResponses,
			recentNotes,
			now: Date.now(),
		};
	},
});

// ── Action: generate wellness report via Claude Opus 4.6 ──

export const generateReport = action({
	args: {},
	handler: async (ctx): Promise<WellnessReport> => {
		// Verify caller is authenticated
		const userUuid = await ctx.runQuery(internal.users.verifyAuth);

		// Gather all social data
		const data = await ctx.runQuery(internal.wellness.gatherSocialData, {
			userUuid,
		});

		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error("AI wellness not configured");
		}

		const systemPrompt = `You are the Social Wellness Companion for Orbyt, a non-addictive social connection platform. Your job is to analyze a user's social graph and help them nurture their real-world friendships — not keep them on screen.

You'll receive structured data about:
- The user's friends
- How long they've been friends
- Recent beacons (spontaneous/planned hangout invitations)
- Beacon responses (who's joining, interested, or declining)
- Recent notes on their canvas (interest/topic signals)

Analyze this data and return a JSON wellness report. Be warm, specific, and actionable. Reference actual friend names and real patterns you see. Never be judgmental — frame everything positively. If someone is drifting, suggest a gentle reconnection, not a guilt trip.

Your response must be ONLY valid JSON matching this exact schema:
{
  "overallHealth": "thriving" | "connected" | "growing" | "needs-attention",
  "healthScore": 1-100,
  "summary": "2-3 warm sentences about their overall social health",
  "friendInsights": [
    {
      "name": "friend's display name",
      "emoji": "single emoji that captures the vibe",
      "status": "thriving" | "connected" | "drifting" | "new",
      "insight": "1 sentence about this friendship's current state",
      "suggestion": "1 specific, actionable idea for this friendship"
    }
  ],
  "activitySuggestions": [
    {
      "emoji": "activity emoji",
      "title": "Short activity name (2-5 words)",
      "description": "1-2 sentences selling the vibe",
      "bestFor": "which friends this is best for",
      "timing": "when to do it (natural language)"
    }
  ],
  "charityCause": {
    "emoji": "cause emoji",
    "cause": "Specific cause or organization name",
    "whyItFits": "1 sentence connecting this cause to the friend group's interests/activities",
    "firstStep": "1 specific, easy first action they can take together"
  },
  "weeklyNudge": "One gentle, specific action for this week — reference a real friend or pattern"
}

Rules:
- activitySuggestions: exactly 3 ideas, varied in intensity/setting
- friendInsights: one per friend (max 10)
- Activities should be real-world, in-person, fun — not screen-based
- charityCause should connect to the group's actual interests (sports = youth athletics, food = food banks, outdoors = conservation, etc.)
- weeklyNudge should be ONE specific thing they can do THIS WEEK
- If there are few friends or beacons, be encouraging about building connections, not critical
- Keep the tone like a wise friend, not a therapist or corporate wellness app
- No markdown, no code fences — pure JSON only`;

		const friendLines = data.friends.length > 0
			? data.friends.map((f) => {
				const friendship = data.friendshipDates.find(
					(fd) => fd.friendUuid === f.uuid
				);
				const daysSince = friendship
					? Math.floor((data.now - friendship.since) / (1000 * 60 * 60 * 24))
					: 0;
				return `- ${f.displayName} (@${f.username}) — friends for ${daysSince} days`;
			}).join("\n")
			: "No friends yet";

		const beaconLines = data.beacons.length > 0
			? data.beacons.map((b) => {
				const creator = b.creatorId === userUuid
					? "me"
					: data.friends.find((f) => f.uuid === b.creatorId)?.displayName ?? "unknown";
				return `- "${b.title}" by ${creator}${b.description ? ` — ${b.description}` : ""}`;
			}).join("\n")
			: "No beacons yet";

		const responseLines = data.beaconResponses.length > 0
			? data.beaconResponses.map((br) => {
				const joining = br.responses.filter((r) => r.status === "joining").length;
				const interested = br.responses.filter((r) => r.status === "interested").length;
				const declined = br.responses.filter((r) => r.status === "declined").length;
				return `- "${br.beaconTitle}": ${joining} joining, ${interested} interested, ${declined} can't make it`;
			}).join("\n")
			: "No responses yet";

		const noteLines = data.recentNotes.length > 0
			? data.recentNotes.map((n) => `- ${n.title ? `[${n.title}] ` : ""}${n.text.slice(0, 100)}`).join("\n")
			: "No notes yet";

		const dateStr = new Date(data.now).toLocaleDateString("en-US", {
			weekday: "long", month: "long", day: "numeric", year: "numeric",
		});

		const userMessage = `Here's my social data:

**Me:** ${data.user.displayName} (@${data.user.username})

**Friends (${data.friends.length}):**
${friendLines}

**Recent Beacons (last 30 days): ${data.beacons.length}**
${beaconLines}

**Beacon Responses:**
${responseLines}

**Recent Notes on Canvas:**
${noteLines}

**Current date:** ${dateStr}

Analyze my social wellness and generate the report.`;

		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-opus-4-6",
				max_tokens: 1500,
				system: systemPrompt,
				messages: [{ role: "user", content: userMessage }],
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			console.error("Anthropic API error:", res.status, text);
			throw new Error("Failed to generate wellness report — try again");
		}

		const apiData = await res.json();
		let rawText: string = apiData.content?.[0]?.text ?? "";

		// Strip markdown code fences if Claude wraps them
		rawText = rawText
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/i, "")
			.trim();

		let report: WellnessReport;
		try {
			report = JSON.parse(rawText);
		} catch {
			console.error("Failed to parse wellness report:", rawText);
			throw new Error("AI returned unexpected format — try again");
		}

		// Validate shape
		if (
			!report.overallHealth ||
			typeof report.healthScore !== "number" ||
			!report.summary ||
			!Array.isArray(report.friendInsights) ||
			!Array.isArray(report.activitySuggestions) ||
			!report.charityCause ||
			!report.weeklyNudge
		) {
			throw new Error("AI returned unexpected format — try again");
		}

		return report;
	},
});

// ── Demo data seeding (dev-only) ──

export const seedDemoFriends = mutation({
	args: {},
	handler: async (ctx) => {
		// Find the first user (Joe)
		const joe = await ctx.db.query("users").first();
		if (!joe) throw new Error("No users exist — sign in first");

		const demoFriends = [
			{ username: "mango", displayName: "Mango" },
			{ username: "bishop", displayName: "Bishop" },
			{ username: "bella", displayName: "Bella" },
		];

		const createdFriends: string[] = [];

		for (const friend of demoFriends) {
			// Check if already exists
			const existing = await ctx.db
				.query("users")
				.withIndex("by_username", (q) => q.eq("username", friend.username))
				.first();
			if (existing) {
				createdFriends.push(existing.uuid);
				continue;
			}

			const uuid = crypto.randomUUID();

			// Create user
			await ctx.db.insert("users", {
				uuid,
				authAccountId: `demo-${friend.username}`,
				username: friend.username,
				displayName: friend.displayName,
				friendCode: `DEMO${friend.username.toUpperCase().slice(0, 6)}`,
			});

			// Create personal canvas
			await ctx.db.insert("canvases", {
				ownerId: uuid,
				name: `${friend.displayName}'s canvas`,
				type: "personal",
				bounds: { width: 3000, height: 2000 },
			});

			// Create accepted friendship with Joe (random age within 60 days)
			await ctx.db.insert("friendships", {
				requesterId: joe.uuid,
				receiverId: uuid,
				status: "accepted",
				createdAt: Date.now() - Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000),
			});

			createdFriends.push(uuid);
		}

		// Create beacons on Joe's canvas
		const joeCanvas = await ctx.db
			.query("canvases")
			.withIndex("by_owner_type", (q) =>
				q.eq("ownerId", joe.uuid).eq("type", "personal")
			)
			.first();

		if (!joeCanvas) throw new Error("Joe's canvas not found");

		const beaconData = [
			{
				title: "Dog Park Meetup",
				description: "Bringing Rocko for off-leash play — all pups welcome, bring water and poop bags",
				creatorId: joe.uuid,
				startTime: Date.now() + 2 * 24 * 60 * 60 * 1000,
			},
			{
				title: "Pack Walk & Coffee",
				description: "Morning group walk with all the dogs, then hitting the dog-friendly cafe after",
				creatorId: createdFriends[0],
				startTime: Date.now() + 1 * 24 * 60 * 60 * 1000,
			},
			{
				title: "Beach Day with the Pups",
				description: "Sunset beach hangout — dogs run free, humans bring snacks and good vibes",
				creatorId: createdFriends[2],
				startTime: Date.now() + 5 * 24 * 60 * 60 * 1000,
			},
		];

		for (const beacon of beaconData) {
			const endTime = beacon.startTime + 3 * 60 * 60 * 1000;
			const beaconId = await ctx.db.insert("canvasObjects", {
				canvasId: joeCanvas._id,
				creatorId: beacon.creatorId,
				type: "beacon",
				position: {
					x: 300 + Math.random() * 1500,
					y: 200 + Math.random() * 800,
				},
				size: { w: 260, h: 100 },
				content: {
					title: beacon.title,
					description: beacon.description,
					startTime: beacon.startTime,
					endTime,
					visibilityType: "canvas" as const,
				},
				expiresAt: endTime,
			});

			// Add varied responses from friends
			const statuses: Array<"joining" | "interested" | "declined"> = [
				"joining", "interested", "declined",
			];
			for (let i = 0; i < createdFriends.length; i++) {
				if (createdFriends[i] === beacon.creatorId) continue;
				await ctx.db.insert("beaconResponses", {
					beaconId,
					userId: createdFriends[i],
					status: statuses[i % 3],
					respondedAt: Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000),
				});
			}
		}

		return { seeded: createdFriends.length, beacons: beaconData.length };
	},
});

/** Seed rich canvas content for demo friends — notes, beacons, music vibes */
export const seedDemoCanvasData = mutation({
	args: {},
	handler: async (ctx) => {
		const joe = await ctx.db.query("users").first();
		if (!joe) throw new Error("No users exist — sign in first");

		// Look up demo friends
		const mango = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", "mango")).first();
		const bishop = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", "bishop")).first();
		const bella = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", "bella")).first();

		if (!mango || !bishop || !bella) throw new Error("Run seedDemoFriends first");

		const friends = [mango, bishop, bella];
		let totalObjects = 0;

		// Content per friend — varied interests and vibes
		const friendContent: Record<string, {
			notes: { text: string; title: string; color: number }[];
			beacons: { title: string; description: string }[];
		}> = {
			[mango.uuid]: {
				notes: [
					{ text: "Found the BEST dog-friendly patio downtown. Mango got extra treats from the waiter. Living his best life.", title: "Patio Finds", color: 0xfff9c4 },
					{ text: "Morning trail run with Mango — he kept pace for 5 miles! This golden boy has endless energy.", title: "Trail Adventures", color: 0xc8e6c9 },
					{ text: "Dog park meetup was a hit. Mango made 3 new friends and stole someone's tennis ball. Classic.", title: "Dog Park Report", color: 0xffe0b2 },
					{ text: "Teaching Mango agility tricks. He nailed the weave poles but refuses to do the tunnel. We'll get there.", title: "Training Log", color: 0xbbdefb },
				],
				beacons: [
					{ title: "Dog Beach Day", description: "Off-leash beach run at sunrise — bring towels, treats, and your pup's favorite ball" },
					{ title: "Pack Walk & Coffee", description: "Morning group walk with all the dogs, then hitting the dog-friendly cafe after" },
				],
			},
			[bishop.uuid]: {
				notes: [
					{ text: "Bishop learned 'shake' today! This big goofy boy finally gets it. Took about 200 treats but we're here.", title: "Training Wins", color: 0xf8bbd0 },
					{ text: "Volunteered at the animal shelter Saturday. Bishop was the demo dog for adoptions — 3 dogs found homes!", title: "Shelter Volunteer", color: 0xc8e6c9 },
					{ text: "Hiking with Bishop at the canyon. He carried his own pack like a champ. 7 miles round trip.", title: "Hiking Buddies", color: 0xffe0b2 },
					{ text: "Bishop and Rocko had the best playdate. Absolute chaos in the backyard. Wouldn't trade it.", title: "Playdate Recap", color: 0xbbdefb },
					{ text: "Trying a new raw food diet for Bishop. He's never been this excited about dinner time.", title: "Nutrition Notes", color: 0xfff9c4 },
				],
				beacons: [
					{ title: "Shelter Volunteer Day", description: "Saturday 9am-1pm at the animal shelter. Dogs need walkers and socializers!" },
					{ title: "Canyon Hike (Dogs Welcome)", description: "Moderate 6-mile loop. Bring water for you AND your pup. Bishop's leading the pack." },
				],
			},
			[bella.uuid]: {
				notes: [
					{ text: "Sunset beach walk with Bella was magical. She chased every wave and dug approximately 47 holes.", title: "Beach Life", color: 0xf8bbd0 },
					{ text: "Bella passed her Canine Good Citizen test! So proud of this sweet girl. Celebratory pupcake tonight.", title: "CGC Certified!", color: 0xbbdefb },
					{ text: "Planning a dog camping trip for next month. Joshua Tree has pet-friendly sites. Who's in?", title: "Adventure Planning", color: 0xc8e6c9 },
					{ text: "Farmers market with Bella — she got compliments from every single vendor. Obviously.", title: "Market Walks", color: 0xffe0b2 },
				],
				beacons: [
					{ title: "Sunset Dog Beach Volleyball", description: "Humans play volleyball, dogs run free on the sand. Best of both worlds." },
					{ title: "Dog-Friendly Brunch", description: "Patio brunch spot that has a puppy menu. Bella recommends the chicken bites." },
				],
			},
		};

		for (const friend of friends) {
			// Find their personal canvas
			const canvas = await ctx.db
				.query("canvases")
				.withIndex("by_owner_type", (q) => q.eq("ownerId", friend.uuid).eq("type", "personal"))
				.first();
			if (!canvas) continue;

			const content = friendContent[friend.uuid];
			if (!content) continue;

			// Add notes spread across the canvas
			for (let i = 0; i < content.notes.length; i++) {
				const note = content.notes[i];
				await ctx.db.insert("canvasObjects", {
					canvasId: canvas._id,
					creatorId: friend.uuid,
					type: "textblock",
					position: {
						x: 150 + (i % 3) * 450 + Math.random() * 100,
						y: 150 + Math.floor(i / 3) * 400 + Math.random() * 100,
					},
					size: { w: 280, h: 120 },
					content: { text: note.text, color: note.color, title: note.title },
				});
				totalObjects++;
			}

			// Add beacons
			for (let i = 0; i < content.beacons.length; i++) {
				const beacon = content.beacons[i];
				const startTime = Date.now() + (i + 1) * 2 * 24 * 60 * 60 * 1000;
				const endTime = startTime + 3 * 60 * 60 * 1000;
				const beaconId = await ctx.db.insert("canvasObjects", {
					canvasId: canvas._id,
					creatorId: friend.uuid,
					type: "beacon",
					position: {
						x: 800 + i * 500 + Math.random() * 200,
						y: 600 + Math.random() * 400,
					},
					size: { w: 260, h: 100 },
					content: {
						title: beacon.title,
						description: beacon.description,
						startTime,
						endTime,
						visibilityType: "canvas" as const,
					},
					expiresAt: endTime,
				});
				totalObjects++;

				// Joe responds to friend beacons
				await ctx.db.insert("beaconResponses", {
					beaconId,
					userId: joe.uuid,
					status: i === 0 ? "joining" : "interested",
					respondedAt: Date.now() - Math.floor(Math.random() * 12 * 60 * 60 * 1000),
				});
			}
		}

		return { totalObjects };
	},
});
