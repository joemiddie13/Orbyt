<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		canvasId,
		canvasName,
		onClose,
		onDeleted,
	}: {
		canvasId: string;
		canvasName: string;
		onClose: () => void;
		onDeleted: () => void;
	} = $props();

	const client = useConvexClient();

	// Queries
	const members = useQuery(
		api.access.getCanvasMembers,
		() => ({ canvasId: canvasId as any })
	);
	const friends = useQuery(api.friendships.getFriends, {});

	// Name editing
	let editName = $state(canvasName);
	let saving = $state(false);
	let nameError = $state('');

	// Member removal
	let removing = $state<string | null>(null);

	// Friend invites
	let selectedInvites = $state<Set<string>>(new Set());
	let inviting = $state(false);

	// Delete confirmation
	let deleteConfirmText = $state('');
	let deleting = $state(false);
	let deleteError = $state('');

	// Friends not already members
	const invitableFriends = $derived.by(() => {
		if (!friends.data || !members.data) return [];
		const memberUuids = new Set(members.data.map((m: any) => m?.uuid).filter(Boolean));
		return friends.data.filter((f: any) => !memberUuids.has(f.uuid));
	});

	async function saveName() {
		const trimmed = editName.trim();
		if (!trimmed) { nameError = 'Name cannot be empty'; return; }
		if (trimmed === canvasName) return;
		saving = true;
		nameError = '';
		try {
			await client.mutation(api.canvases.renameCanvas, {
				canvasId: canvasId as any,
				name: trimmed,
			});
		} catch (err: any) {
			nameError = err.message || 'Failed to rename';
		} finally {
			saving = false;
		}
	}

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

	function toggleInvite(uuid: string) {
		const next = new Set(selectedInvites);
		if (next.has(uuid)) next.delete(uuid);
		else next.add(uuid);
		selectedInvites = next;
	}

	async function inviteFriends() {
		if (selectedInvites.size === 0) return;
		inviting = true;
		try {
			await Promise.all(
				[...selectedInvites].map((uuid) =>
					client.mutation(api.access.grantAccess, {
						canvasId: canvasId as any,
						targetUuid: uuid,
						role: 'member' as const,
					})
				)
			);
			selectedInvites = new Set();
		} catch (err) {
			console.error('Failed to invite:', err);
		} finally {
			inviting = false;
		}
	}

	async function deleteOrbyt() {
		if (deleteConfirmText !== canvasName) return;
		deleting = true;
		deleteError = '';
		try {
			await client.mutation(api.canvases.deleteCanvas, {
				canvasId: canvasId as any,
			});
			onDeleted();
		} catch (err: any) {
			deleteError = err.message || 'Failed to delete';
			deleting = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="glass-panel rounded-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col">
		<div class="p-6 overflow-y-auto">
			<!-- Header -->
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-semibold text-white">Orbyt Settings</h2>
				<button
					onclick={onClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Name section -->
			<section class="mb-5">
				<label class="text-sm text-white/50 mb-1 block" for="orbyt-name">Name</label>
				<div class="flex gap-2">
					<input
						id="orbyt-name"
						type="text"
						bind:value={editName}
						maxlength="100"
						class="flex-1 px-3 py-2 rounded-xl glass-input text-sm"
					/>
					<button
						onclick={saveName}
						disabled={saving || editName.trim() === canvasName}
						class="lego-btn lego-amber lego-btn-sm"
					>
						{saving ? '...' : 'Save'}
					</button>
				</div>
				{#if nameError}
					<p class="text-xs text-red-400 mt-1">{nameError}</p>
				{/if}
			</section>

			<div class="h-px bg-white/[0.06] mb-5"></div>

			<!-- Members section -->
			<section class="mb-5">
				<p class="text-sm text-white/50 mb-2">Members</p>
				<div class="space-y-1 max-h-40 overflow-y-auto">
					{#if members.data}
						{#each members.data as member (member?.uuid ?? '')}
							{#if member}
								<div class="flex items-center gap-3 py-2 px-2 rounded-lg">
									<div class="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-medium flex-shrink-0">
										{member.displayName.charAt(0).toUpperCase()}
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-sm text-white/80 truncate">{member.displayName}</p>
										<p class="text-xs text-white/35">@{member.username} · {member.role}</p>
									</div>
									{#if member.role !== 'owner'}
										<button
											onclick={() => removeMember(member.uuid)}
											disabled={removing === member.uuid}
											class="text-xs text-white/30 hover:text-red-400 transition cursor-pointer disabled:opacity-50 flex-shrink-0"
										>
											Remove
										</button>
									{/if}
								</div>
							{/if}
						{/each}
					{/if}
				</div>
			</section>

			<div class="h-px bg-white/[0.06] mb-5"></div>

			<!-- Invite friends section -->
			<section class="mb-5">
				<p class="text-sm text-white/50 mb-2">Invite Friends</p>
				{#if invitableFriends.length > 0}
					<div class="space-y-1 max-h-36 overflow-y-auto mb-2">
						{#each invitableFriends as friend}
							<button
								onclick={() => toggleInvite(friend.uuid)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center gap-2 {selectedInvites.has(friend.uuid) ? 'bg-amber-500/15 text-amber-400' : 'text-white/70 hover:bg-white/10'}"
							>
								<span class="w-5 h-5 rounded border flex items-center justify-center text-xs {selectedInvites.has(friend.uuid) ? 'bg-amber-500 border-amber-500 text-white' : 'border-white/20'}">
									{#if selectedInvites.has(friend.uuid)}&#10003;{/if}
								</span>
								{friend.displayName}
								<span class="text-white/40 text-xs">@{friend.username}</span>
							</button>
						{/each}
					</div>
					{#if selectedInvites.size > 0}
						<button
							onclick={inviteFriends}
							disabled={inviting}
							class="lego-btn lego-btn-full lego-amber"
						>
							{inviting ? 'Inviting...' : `Invite ${selectedInvites.size} friend${selectedInvites.size > 1 ? 's' : ''}`}
						</button>
					{/if}
				{:else if !friends.isLoading}
					<p class="text-sm text-white/30">All friends are already members, or add friends first.</p>
				{/if}
			</section>

			<div class="h-px bg-white/[0.06] mb-5"></div>

			<!-- Danger zone -->
			<section class="border border-red-500/20 rounded-xl p-4">
				<p class="text-sm font-medium text-red-400 mb-2">Danger Zone</p>
				<p class="text-xs text-white/40 mb-3">
					Permanently delete this Orbyt and all its content. This cannot be undone.
				</p>
				<label class="text-xs text-white/40 mb-1 block" for="delete-confirm">
					Type <strong class="text-white/60">{canvasName}</strong> to confirm
				</label>
				<input
					id="delete-confirm"
					type="text"
					bind:value={deleteConfirmText}
					placeholder={canvasName}
					class="w-full px-3 py-2 rounded-xl glass-input text-sm mb-3"
				/>
				{#if deleteError}
					<p class="text-xs text-red-400 mb-2">{deleteError}</p>
				{/if}
				<button
					onclick={deleteOrbyt}
					disabled={deleting || deleteConfirmText !== canvasName}
					class="w-full px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20"
				>
					{deleting ? 'Deleting...' : 'Delete this Orbyt'}
				</button>
			</section>
		</div>
	</div>
</div>
