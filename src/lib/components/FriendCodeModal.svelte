<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		friendCode,
		onClose,
	}: {
		friendCode: string;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();

	let displayCode = $state(friendCode);
	let inputCode = $state('');
	let copied = $state(false);
	let sending = $state(false);
	let message = $state<{ text: string; type: 'success' | 'error' } | null>(null);

	// Backfill friend code for pre-Layer 3 users
	if (!friendCode) {
		client.mutation(api.users.ensureFriendCode, {}).then((code) => {
			if (code) displayCode = code;
		}).catch(() => {});
	}

	async function copyCode() {
		await navigator.clipboard.writeText(displayCode);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	async function sendRequest() {
		const code = inputCode.trim();
		if (!code) return;

		sending = true;
		message = null;
		try {
			await client.mutation(api.friendships.sendRequest, { friendCode: code });
			message = { text: 'Request sent!', type: 'success' };
			inputCode = '';
		} catch (err: any) {
			message = { text: err.message || 'Failed to send request', type: 'error' };
		} finally {
			sending = false;
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
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-semibold text-stone-800">Friends</h2>
				<button
					onclick={onClose}
					class="text-stone-400 hover:text-stone-600 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Your friend code -->
			<div class="mb-6">
				<p class="text-sm text-stone-500 mb-2">Your friend code</p>
				<div class="flex items-center gap-2">
					<code class="flex-1 px-3 py-2 bg-stone-100 rounded-xl text-center font-mono text-lg tracking-wider text-stone-800">
						{displayCode || '...'}
					</code>
					<button
						onclick={copyCode}
						class="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-sm text-stone-600 transition cursor-pointer"
					>
						{copied ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<p class="text-xs text-stone-400 mt-1">Share this with friends so they can connect with you</p>
			</div>

			<!-- Enter a friend's code -->
			<div>
				<p class="text-sm text-stone-500 mb-2">Add a friend</p>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={inputCode}
						placeholder="Enter friend code"
						maxlength="10"
						class="flex-1 px-3 py-2 bg-stone-100 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-amber-400"
						onkeydown={(e) => { if (e.key === 'Enter') sendRequest(); }}
					/>
					<button
						onclick={sendRequest}
						disabled={sending || !inputCode.trim()}
						class="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-default transition cursor-pointer"
					>
						{sending ? '...' : 'Add'}
					</button>
				</div>
				{#if message}
					<p class="text-xs mt-2 {message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}">
						{message.text}
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>
