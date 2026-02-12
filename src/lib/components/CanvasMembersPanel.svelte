<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		canvasId,
		isOwner,
		onClose,
	}: {
		canvasId: string;
		isOwner: boolean;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();
	const members = useQuery(
		api.access.getCanvasMembers,
		() => ({ canvasId: canvasId as any })
	);

	let removing = $state<string | null>(null);

	async function removeMember(uuid: string) {
		removing = uuid;
		try {
			await client.mutation(api.access.revokeAccess, {
				canvasId: canvasId as any,
				targetUuid: uuid,
			});
		} catch (err) {
			console.error('Failed to remove member:', err);
		} finally {
			removing = null;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
		<div class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-stone-800">Canvas Members</h2>
				<button
					onclick={onClose}
					class="text-stone-400 hover:text-stone-600 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-2">
				{#if members.data}
					{#each members.data as member}
						<div class="flex items-center gap-3 py-2">
							<div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-medium">
								{member.displayName.charAt(0).toUpperCase()}
							</div>
							<div class="flex-1">
								<p class="text-sm font-medium text-stone-800">{member.displayName}</p>
								<p class="text-xs text-stone-400">@{member.username} · {member.role}</p>
							</div>
							{#if isOwner && member.role !== 'owner'}
								<button
									onclick={() => removeMember(member.uuid)}
									disabled={removing === member.uuid}
									class="text-xs text-stone-400 hover:text-red-500 transition cursor-pointer disabled:opacity-50"
								>
									Remove
								</button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>
