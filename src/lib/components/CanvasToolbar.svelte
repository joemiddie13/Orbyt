<script lang="ts">
	import { signOut } from '$lib/auth';

	let {
		username,
		canvasName,
		onAddNote,
		onCreateBeacon,
		onFriends,
		onFriendsList,
		onCanvasSwitcher,
		webrtcConnected = false,
	}: {
		username: string;
		canvasName?: string;
		onAddNote: () => void;
		onCreateBeacon: () => void;
		onFriends: () => void;
		onFriendsList: () => void;
		onCanvasSwitcher: () => void;
		webrtcConnected?: boolean;
	} = $props();

	let isSigningOut = $state(false);

	async function handleSignOut() {
		isSigningOut = true;
		await signOut();
	}
</script>

<div class="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg border border-stone-200/50">
	<span class="text-sm font-medium text-stone-600 flex items-center gap-1.5">
		{username}
		{#if webrtcConnected}
			<span
				class="w-2 h-2 rounded-full bg-emerald-400"
				title="Real-time connected"
			></span>
		{/if}
	</span>

	<div class="w-px h-5 bg-stone-200"></div>

	<!-- Canvas name / switcher -->
	<button
		onclick={onCanvasSwitcher}
		class="px-2 py-1 rounded-lg text-sm text-stone-500 hover:bg-stone-100 transition cursor-pointer flex items-center gap-1"
	>
		{canvasName ?? 'My Canvas'}
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<div class="w-px h-5 bg-stone-200"></div>

	<button
		onclick={onAddNote}
		class="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 active:bg-amber-700 transition cursor-pointer"
	>
		+ Note
	</button>

	<button
		onclick={onCreateBeacon}
		class="px-3 py-1.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 active:bg-orange-700 transition cursor-pointer"
	>
		+ Beacon
	</button>

	<div class="w-px h-5 bg-stone-200"></div>

	<!-- Friends buttons -->
	<button
		onclick={onFriends}
		title="Friend Code"
		class="px-2 py-1.5 rounded-xl text-stone-500 hover:bg-stone-100 active:bg-stone-200 transition cursor-pointer"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
		</svg>
	</button>

	<button
		onclick={onFriendsList}
		title="Your Friends"
		class="px-2 py-1.5 rounded-xl text-stone-500 hover:bg-stone-100 active:bg-stone-200 transition cursor-pointer"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
	</button>

	<button
		onclick={handleSignOut}
		disabled={isSigningOut}
		class="px-3 py-1.5 rounded-xl text-stone-500 text-sm hover:bg-stone-100 active:bg-stone-200 disabled:opacity-50 transition cursor-pointer"
	>
		Sign out
	</button>
</div>
