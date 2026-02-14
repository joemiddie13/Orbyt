<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		beacon,
		userUuid,
		onClose,
	}: {
		beacon: {
			_id: string;
			content: {
				title: string;
				description?: string;
				locationAddress?: string;
				startTime: number;
				endTime: number;
				visibilityType: string;
			};
			creatorId: string;
		};
		userUuid: string;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();
	const responses = useQuery(
		api.responses.getByBeacon,
		() => ({ beaconId: beacon._id as any })
	);

	let responding = $state(false);

	async function respond(status: 'joining' | 'interested' | 'declined') {
		responding = true;
		try {
			await client.mutation(api.responses.respond, {
				beaconId: beacon._id as any,
				status,
			});
		} catch (err) {
			console.error('Failed to respond:', err);
		} finally {
			responding = false;
		}
	}

	async function removeResponse() {
		responding = true;
		try {
			await client.mutation(api.responses.removeResponse, {
				beaconId: beacon._id as any,
			});
		} catch (err) {
			console.error('Failed to remove response:', err);
		} finally {
			responding = false;
		}
	}

	const myResponse = $derived(
		responses.data?.find((r: any) => r.userId === userUuid)
	);

	const joining = $derived(
		responses.data?.filter((r: any) => r.status === 'joining') ?? []
	);
	const interested = $derived(
		responses.data?.filter((r: any) => r.status === 'interested') ?? []
	);

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function formatDate(ts: number): string {
		const d = new Date(ts);
		const now = new Date();
		if (d.toDateString() === now.toDateString()) return 'Today';
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="glass-panel rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden max-h-[80vh] flex flex-col">
		<!-- Header -->
		<div class="p-6 pb-3 flex-shrink-0 bg-gradient-to-b from-orange-500/10 to-transparent">
			<div class="flex items-start justify-between mb-3">
				<h2 class="text-xl font-bold text-white flex-1 pr-4">{beacon.content.title}</h2>
				<button
					onclick={onClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer flex-shrink-0"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-1 text-sm text-white/60">
				<p>{formatDate(beacon.content.startTime)} · {formatTime(beacon.content.startTime)} – {formatTime(beacon.content.endTime)}</p>
				{#if beacon.content.locationAddress}
					<p>📍 {beacon.content.locationAddress}</p>
				{/if}
			</div>

			{#if beacon.content.description}
				<p class="mt-3 text-sm text-white/70">{beacon.content.description}</p>
			{/if}
		</div>

		<!-- Response buttons -->
		<div class="px-6 py-3 flex gap-2 flex-shrink-0">
			<button
				onclick={() => myResponse?.status === 'joining' ? removeResponse() : respond('joining')}
				disabled={responding}
				class="flex-1 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50 {myResponse?.status === 'joining' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}"
			>
				{myResponse?.status === 'joining' ? "I'm in! ✓" : "I'm in"}
			</button>
			<button
				onclick={() => myResponse?.status === 'interested' ? removeResponse() : respond('interested')}
				disabled={responding}
				class="flex-1 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50 {myResponse?.status === 'interested' ? 'bg-amber-500 text-white' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}"
			>
				{myResponse?.status === 'interested' ? 'Interested ✓' : 'Interested'}
			</button>
			<button
				onclick={() => myResponse?.status === 'declined' ? removeResponse() : respond('declined')}
				disabled={responding}
				class="flex-1 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50 {myResponse?.status === 'declined' ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/60 hover:bg-white/10'}"
			>
				{myResponse?.status === 'declined' ? "Can't ✓" : "Can't make it"}
			</button>
		</div>

		<!-- Attendee list -->
		<div class="flex-1 overflow-y-auto px-6 pb-6">
			{#if joining.length > 0}
				<div class="mb-3">
					<p class="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1.5">Going</p>
					<div class="flex flex-wrap gap-1.5">
						{#each joining as person}
							<span class="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs">
								{person.displayName}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if interested.length > 0}
				<div>
					<p class="text-xs font-medium text-amber-400 uppercase tracking-wider mb-1.5">Interested</p>
					<div class="flex flex-wrap gap-1.5">
						{#each interested as person}
							<span class="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs">
								{person.displayName}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if !responses.data || responses.data.length === 0}
				<p class="text-sm text-white/40 text-center py-4">No responses yet — be the first!</p>
			{/if}
		</div>
	</div>
</div>
