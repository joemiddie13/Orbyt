<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		canvasId,
		userUuid,
		onClose,
	}: {
		canvasId: string;
		userUuid: string;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();
	const friends = useQuery(api.friendships.getFriends, {});

	let title = $state('');
	let description = $state('');
	let locationAddress = $state('');
	let startTime = $state(getDefaultStartTime());
	let endTime = $state(getDefaultEndTime());
	let visibilityType = $state<'canvas' | 'direct'>('canvas');
	let selectedRecipients = $state<Set<string>>(new Set());
	let creating = $state(false);
	let error = $state('');

	function getDefaultStartTime(): string {
		const now = new Date();
		now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
		return formatDatetimeLocal(now);
	}

	function getDefaultEndTime(): string {
		const now = new Date();
		now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
		now.setHours(now.getHours() + 2);
		return formatDatetimeLocal(now);
	}

	function formatDatetimeLocal(date: Date): string {
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function toggleRecipient(uuid: string) {
		const next = new Set(selectedRecipients);
		if (next.has(uuid)) next.delete(uuid);
		else next.add(uuid);
		selectedRecipients = next;
	}

	async function createBeacon() {
		if (!title.trim()) { error = 'Give your beacon a title'; return; }
		const start = new Date(startTime).getTime();
		const end = new Date(endTime).getTime();
		if (start >= end) { error = 'End time must be after start time'; return; }
		if (visibilityType === 'direct' && selectedRecipients.size === 0) {
			error = 'Select at least one friend for a direct beacon';
			return;
		}

		creating = true;
		error = '';

		try {
			await client.mutation(api.objects.create, {
				canvasId: canvasId as any,
				type: 'beacon',
				position: { x: 400 + Math.random() * 600, y: 300 + Math.random() * 400 },
				size: { w: 260, h: 100 },
				content: {
					title: title.trim(),
					description: description.trim() || undefined,
					locationAddress: locationAddress.trim() || undefined,
					startTime: start,
					endTime: end,
					visibilityType,
					directRecipients: visibilityType === 'direct' ? [...selectedRecipients] : undefined,
				},
				expiresAt: end,
			});
			onClose();
		} catch (err: any) {
			error = err.message || 'Failed to create beacon';
			creating = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col">
		<div class="p-6 flex-shrink-0">
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-semibold text-stone-800">Create Beacon</h2>
				<button
					onclick={onClose}
					class="text-stone-400 hover:text-stone-600 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
			<div>
				<label class="text-sm text-stone-500 mb-1 block" for="beacon-title">What's happening?</label>
				<input
					id="beacon-title"
					type="text"
					bind:value={title}
					placeholder="Pickup basketball, Coffee run, Movie night..."
					maxlength="200"
					class="w-full px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-orange-400"
				/>
			</div>

			<div>
				<label class="text-sm text-stone-500 mb-1 block" for="beacon-desc">Details (optional)</label>
				<textarea
					id="beacon-desc"
					bind:value={description}
					placeholder="Any extra info..."
					rows="2"
					maxlength="500"
					class="w-full px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-orange-400 resize-none"
				></textarea>
			</div>

			<div>
				<label class="text-sm text-stone-500 mb-1 block" for="beacon-loc">Where? (optional)</label>
				<input
					id="beacon-loc"
					type="text"
					bind:value={locationAddress}
					placeholder="The park, Mike's house, Downtown..."
					maxlength="200"
					class="w-full px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-orange-400"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-sm text-stone-500 mb-1 block" for="beacon-start">Start</label>
					<input
						id="beacon-start"
						type="datetime-local"
						bind:value={startTime}
						class="w-full px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 outline-none focus:ring-2 focus:ring-orange-400"
					/>
				</div>
				<div>
					<label class="text-sm text-stone-500 mb-1 block" for="beacon-end">End</label>
					<input
						id="beacon-end"
						type="datetime-local"
						bind:value={endTime}
						class="w-full px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 outline-none focus:ring-2 focus:ring-orange-400"
					/>
				</div>
			</div>

			<!-- Visibility -->
			<div>
				<p class="text-sm text-stone-500 mb-2">Who can see this?</p>
				<div class="flex gap-2">
					<button
						onclick={() => { visibilityType = 'canvas'; }}
						class="flex-1 py-2 rounded-xl text-sm font-medium transition cursor-pointer {visibilityType === 'canvas' ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
					>
						Everyone on canvas
					</button>
					<button
						onclick={() => { visibilityType = 'direct'; }}
						class="flex-1 py-2 rounded-xl text-sm font-medium transition cursor-pointer {visibilityType === 'direct' ? 'bg-teal-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
					>
						Direct to friends
					</button>
				</div>
			</div>

			<!-- Direct recipients -->
			{#if visibilityType === 'direct' && friends.data && friends.data.length > 0}
				<div>
					<p class="text-sm text-stone-500 mb-2">Send to</p>
					<div class="max-h-32 overflow-y-auto space-y-1">
						{#each friends.data as friend}
							<button
								onclick={() => toggleRecipient(friend.uuid)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center gap-2 {selectedRecipients.has(friend.uuid) ? 'bg-teal-50 text-teal-700' : 'text-stone-700 hover:bg-stone-50'}"
							>
								<span class="w-5 h-5 rounded border flex items-center justify-center text-xs {selectedRecipients.has(friend.uuid) ? 'bg-teal-500 border-teal-500 text-white' : 'border-stone-300'}">
									{#if selectedRecipients.has(friend.uuid)}✓{/if}
								</span>
								{friend.displayName}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if error}
				<p class="text-xs text-red-500">{error}</p>
			{/if}

			<button
				onclick={createBeacon}
				disabled={creating || !title.trim()}
				class="w-full py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-default transition cursor-pointer"
			>
				{creating ? 'Creating...' : 'Drop Beacon'}
			</button>
		</div>
	</div>
</div>
