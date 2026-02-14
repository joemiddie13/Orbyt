<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		onCreated,
		onClose,
	}: {
		onCreated: (canvasId: string) => void;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();
	const friends = useQuery(api.friendships.getFriends, {});

	let canvasName = $state('');
	let selectedFriends = $state<Set<string>>(new Set());
	let creating = $state(false);
	let error = $state('');

	function toggleFriend(uuid: string) {
		const next = new Set(selectedFriends);
		if (next.has(uuid)) {
			next.delete(uuid);
		} else {
			next.add(uuid);
		}
		selectedFriends = next;
	}

	async function createCanvas() {
		if (!canvasName.trim()) {
			error = 'Give your canvas a name';
			return;
		}
		creating = true;
		error = '';
		try {
			const canvasId = await client.mutation(api.canvases.createSharedCanvas, {
				name: canvasName.trim(),
				inviteUuids: [...selectedFriends],
			});
			onCreated(canvasId as string);
		} catch (err: any) {
			error = err.message || 'Failed to create canvas';
			creating = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="glass-panel rounded-2xl w-full max-w-sm mx-4 overflow-hidden">
		<div class="p-6">
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-semibold text-white">New Shared Canvas</h2>
				<button
					onclick={onClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="mb-4">
				<label class="text-sm text-white/50 mb-1 block" for="canvas-name">Name</label>
				<input
					id="canvas-name"
					type="text"
					bind:value={canvasName}
					placeholder="Weekend hangout, Game night..."
					maxlength="100"
					class="w-full px-3 py-2 rounded-xl glass-input text-sm"
				/>
			</div>

			<!-- Friend selector -->
			{#if friends.data && friends.data.length > 0}
				<div class="mb-4">
					<p class="text-sm text-white/50 mb-2">Invite friends</p>
					<div class="max-h-40 overflow-y-auto space-y-1">
						{#each friends.data as friend}
							<button
								onclick={() => toggleFriend(friend.uuid)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center gap-2 {selectedFriends.has(friend.uuid) ? 'bg-amber-500/15 text-amber-400' : 'text-white/70 hover:bg-white/10'}"
							>
								<span class="w-5 h-5 rounded border flex items-center justify-center text-xs {selectedFriends.has(friend.uuid) ? 'bg-amber-500 border-amber-500 text-white' : 'border-white/20'}">
									{#if selectedFriends.has(friend.uuid)}✓{/if}
								</span>
								{friend.displayName}
								<span class="text-white/40 text-xs">@{friend.username}</span>
							</button>
						{/each}
					</div>
				</div>
			{:else if !friends.isLoading}
				<p class="text-sm text-white/40 mb-4">Add some friends first to invite them to a shared canvas.</p>
			{/if}

			{#if error}
				<p class="text-xs text-red-400 mb-3">{error}</p>
			{/if}

			<button
				onclick={createCanvas}
				disabled={creating || !canvasName.trim()}
				class="w-full py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-default transition cursor-pointer"
			>
				{creating ? 'Creating...' : 'Create Canvas'}
			</button>
		</div>
	</div>
</div>
