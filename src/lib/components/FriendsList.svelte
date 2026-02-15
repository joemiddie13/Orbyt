<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let { onClose }: { onClose: () => void } = $props();

	const client = useConvexClient();
	const friends = useQuery(api.friendships.getFriends, {});
	const pendingRequests = useQuery(api.friendships.getPendingRequests, {});

	let respondingTo = $state<string | null>(null);

	async function accept(friendshipId: string) {
		respondingTo = friendshipId;
		try {
			await client.mutation(api.friendships.acceptRequest, { friendshipId: friendshipId as any });
		} catch (err) {
			console.error('Failed to accept:', err);
		} finally {
			respondingTo = null;
		}
	}

	async function decline(friendshipId: string) {
		respondingTo = friendshipId;
		try {
			await client.mutation(api.friendships.declineRequest, { friendshipId: friendshipId as any });
		} catch (err) {
			console.error('Failed to decline:', err);
		} finally {
			respondingTo = null;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="glass-panel rounded-2xl w-full max-w-sm mx-4 overflow-hidden max-h-[80vh] flex flex-col">
		<div class="p-6 flex-shrink-0">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-white">Your People</h2>
				<button
					onclick={onClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-6 pb-6">
			<!-- Pending requests -->
			{#if pendingRequests.data && pendingRequests.data.length > 0}
				<div class="mb-5">
					<p class="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Pending Requests</p>
					{#each pendingRequests.data as req}
						<div class="flex items-center justify-between py-2">
							<div>
								<p class="text-sm font-medium text-white">{req.displayName}</p>
								<p class="text-xs text-white/40">@{req.username}</p>
							</div>
							<div class="flex gap-1.5">
								<button
									onclick={() => accept(req.friendshipId)}
									disabled={respondingTo === req.friendshipId}
									class="lego-btn lego-btn-sm lego-emerald"
								>
									Accept
								</button>
								<button
									onclick={() => decline(req.friendshipId)}
									disabled={respondingTo === req.friendshipId}
									class="lego-btn lego-btn-sm lego-neutral"
								>
									Decline
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Friends list -->
			{#if friends.data && friends.data.length > 0}
				<div>
					<p class="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Connected</p>
					{#each friends.data as friend}
						<div class="flex items-center gap-3 py-2">
							<div class="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-sm font-medium">
								{friend.displayName.charAt(0).toUpperCase()}
							</div>
							<div>
								<p class="text-sm font-medium text-white">{friend.displayName}</p>
								<p class="text-xs text-white/40">@{friend.username}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else if !friends.isLoading}
				<p class="text-sm text-white/40 text-center py-4">No friends yet. Share your friend code to connect!</p>
			{/if}
		</div>
	</div>
</div>
