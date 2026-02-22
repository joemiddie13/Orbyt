<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		onNavigateToFriend = undefined,
	}: {
		/** Called when user clicks a friend — navigates to their personal canvas */
		onNavigateToFriend?: (friendUuid: string, displayName: string) => void;
	} = $props();

	const client = useConvexClient();
	const friends = useQuery(api.friendships.getFriends, {});
	const pendingRequests = useQuery(api.friendships.getPendingRequests, {});

	let open = $state(false);
	let popover = $state<HTMLDivElement>(undefined!);
	let trigger = $state<HTMLButtonElement>(undefined!);
	let respondingTo = $state<string | null>(null);

	const hasPending = $derived((pendingRequests.data?.length ?? 0) > 0);

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			requestAnimationFrame(() => {
				if (!popover) return;
				gsap.fromTo(popover,
					{ scale: 0.6, opacity: 0, transformOrigin: 'top right' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
			});
		}
	}

	function close() {
		if (!open || !popover) { open = false; return; }
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'top right',
			onComplete: () => { open = false; },
		});
	}

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

	function handleClickOutside(e: MouseEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (trigger?.contains(target) || popover?.contains(target)) return;
		close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
			e.stopPropagation();
		}
	}

	onMount(() => {
		document.addEventListener('pointerdown', handleClickOutside);
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('pointerdown', handleClickOutside);
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<div class="dropdown-root">
	<button
		bind:this={trigger}
		class="dropdown-trigger"
		class:open
		onclick={toggle}
		title="Your Friends"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
		{#if hasPending}
			<span class="notification-dot"></span>
		{/if}
	</button>

	{#if open}
		<div bind:this={popover} class="dropdown-popover">
			<div class="dropdown-header">
				<span class="dropdown-title">YOUR PEOPLE</span>
			</div>

			<div class="dropdown-content">
				{#if pendingRequests.data && pendingRequests.data.length > 0}
					<div class="dropdown-section">
						<p class="section-label">Pending Requests</p>
						{#each pendingRequests.data as req (req?.friendshipId ?? '')}
							{#if req}
								<div class="request-row">
									<div class="request-info">
										<p class="friend-name">{req.displayName}</p>
										<p class="friend-username">@{req.username}</p>
									</div>
									<div class="request-actions">
										<button
											onclick={() => accept(req.friendshipId)}
											disabled={respondingTo === req.friendshipId}
											class="action-btn action-accept"
										>
											Accept
										</button>
										<button
											onclick={() => decline(req.friendshipId)}
											disabled={respondingTo === req.friendshipId}
											class="action-btn action-decline"
										>
											Decline
										</button>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				{#if friends.data && friends.data.length > 0}
					<div class="dropdown-section">
						<p class="section-label">Connected</p>
						{#each friends.data as friend (friend.uuid)}
							<button
								class="friend-row"
								onclick={() => {
									if (onNavigateToFriend) {
										onNavigateToFriend(friend.uuid, friend.displayName);
										close();
									}
								}}
							>
								<div class="friend-avatar">
									{friend.displayName.charAt(0).toUpperCase()}
								</div>
								<div class="friend-row-info">
									<p class="friend-name">{friend.displayName}</p>
									<p class="friend-username">@{friend.username}</p>
								</div>
								{#if onNavigateToFriend}
									<svg class="friend-nav-arrow" width="14" height="14" viewBox="0 0 20 20" fill="none">
										<path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{:else if !friends.isLoading}
					<p class="empty-state">Share your friend code to connect!</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.dropdown-root {
		position: relative;
	}

	.dropdown-trigger {
		position: relative;
		padding: 6px 8px;
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.6);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.2s, background 0.2s;
	}

	.dropdown-trigger:hover,
	.dropdown-trigger.open {
		color: rgba(255, 255, 255, 0.85);
		background: rgba(255, 255, 255, 0.1);
	}

	.notification-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #f59e0b;
		box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
	}

	.dropdown-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 288px;
		max-height: 400px;
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		background: rgba(15, 14, 26, 0.82);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
		z-index: 50;
		overflow: hidden;
	}

	.dropdown-header {
		padding: 14px 16px 8px;
		flex-shrink: 0;
	}

	.dropdown-title {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.35);
	}

	.dropdown-content {
		flex: 1;
		overflow-y: auto;
		padding: 0 12px 12px;
	}

	.dropdown-section {
		margin-bottom: 8px;
	}

	.section-label {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 6px;
		padding: 0 4px;
	}

	.request-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 4px;
		border-radius: 8px;
		transition: background 0.15s;
	}

	.request-row:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.request-info {
		flex: 1;
		min-width: 0;
	}

	.request-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.action-btn {
		padding: 4px 10px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 500;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.action-accept {
		background: rgba(52, 211, 153, 0.15);
		color: #6ee7b7;
	}

	.action-accept:hover:not(:disabled) {
		background: rgba(52, 211, 153, 0.25);
	}

	.action-decline {
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.5);
	}

	.action-decline:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
	}

	.friend-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 4px;
		border-radius: 8px;
		transition: background 0.15s;
		width: 100%;
		border: none;
		background: transparent;
		cursor: pointer;
		text-align: left;
	}

	.friend-row:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	.friend-row-info {
		flex: 1;
		min-width: 0;
	}

	.friend-nav-arrow {
		color: rgba(255, 255, 255, 0.25);
		flex-shrink: 0;
		transition: color 0.15s, transform 0.15s;
	}

	.friend-row:hover .friend-nav-arrow {
		color: rgba(255, 255, 255, 0.5);
		transform: translateX(2px);
	}

	.friend-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(245, 158, 11, 0.15);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fbbf24;
		font-size: 12px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.friend-name {
		font-size: 13px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.2;
	}

	.friend-username {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.35);
		line-height: 1.2;
	}

	.empty-state {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.3);
		text-align: center;
		padding: 16px 8px;
	}
</style>
