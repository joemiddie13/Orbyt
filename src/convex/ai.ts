import { v } from "convex/values";
import { action } from "./_generated/server";

interface AISuggestion {
	activity: string;
	location: string;
	description: string;
	timeHint: string;
	durationHint: string;
	emoji: string;
}

export const suggestActivities = action({
	args: {
		prompt: v.string(),
		timeOfDay: v.string(),
		dayOfWeek: v.string(),
		friendCount: v.number(),
	},
	handler: async (_ctx, args): Promise<AISuggestion[]> => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error("AI suggestions not configured");
		}

		const groupContext =
			args.friendCount === 0
				? "a canvas-wide beacon (open to anyone)"
				: args.friendCount === 1
					? "a hangout with 1 friend"
					: `a hangout with ${args.friendCount} friends`;

		const systemPrompt = `You are a hangout idea generator for Orbyt, a social app that helps friends meet up in person. A user will describe what they're in the mood for in natural language. Interpret their vibe and suggest 3 fun, real-world (in-person) activities that match. Be creative — riff on their energy, not just their literal words.

Rules:
- Activity names: short (2-5 words), action-oriented
- Locations: generic and relatable ("the park", "a rooftop bar", "the waterfront") — no specific business names
- Time hints: natural language a date parser understands ("in 30 minutes", "at 7pm", "tomorrow at noon") — make them feel right for the vibe
- Duration hints: natural language ("2 hours", "45 minutes", "all afternoon")
- Match the energy to time of day and group size
- Each suggestion should feel distinct — vary the intensity, setting, or style
- Respond with ONLY a JSON array of exactly 3 objects, no markdown, no explanation

Each object must have these fields:
- activity (string, 2-5 words)
- location (string, generic place)
- description (string, 1 sentence, fun and casual — sell the vibe)
- timeHint (string, natural language time)
- durationHint (string, natural language duration)
- emoji (string, single emoji)`;

		const userMessage = `It's ${args.dayOfWeek} ${args.timeOfDay}. This is for ${groupContext}.\n\nThe user says: "${args.prompt}"`;

		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-opus-4-6",
				max_tokens: 400,
				system: systemPrompt,
				messages: [{ role: "user", content: userMessage }],
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			console.error("Anthropic API error:", res.status, text);
			throw new Error("Failed to get suggestions — try again");
		}

		const data = await res.json();
		let rawText: string = data.content?.[0]?.text ?? "";

		// Strip markdown code fences if Claude wraps them
		rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

		let suggestions: AISuggestion[];
		try {
			suggestions = JSON.parse(rawText);
		} catch {
			console.error("Failed to parse AI response:", rawText);
			throw new Error("AI returned unexpected format — try again");
		}

		if (!Array.isArray(suggestions) || suggestions.length !== 3) {
			throw new Error("AI returned unexpected format — try again");
		}

		// Validate shape
		for (const s of suggestions) {
			if (
				typeof s.activity !== "string" ||
				typeof s.location !== "string" ||
				typeof s.description !== "string" ||
				typeof s.timeHint !== "string" ||
				typeof s.durationHint !== "string" ||
				typeof s.emoji !== "string"
			) {
				throw new Error("AI returned unexpected format — try again");
			}
		}

		return suggestions;
	},
});
