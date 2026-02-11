<script lang="ts">
	import { signOut } from '$lib/auth';

	let { username, onAddNote }: { username: string; onAddNote: () => void } = $props();

	let isSigningOut = $state(false);

	async function handleSignOut() {
		isSigningOut = true;
		await signOut();
	}
</script>

<div class="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg border border-stone-200/50">
	<span class="text-sm font-medium text-stone-600">
		{username}
	</span>

	<div class="w-px h-5 bg-stone-200"></div>

	<button
		onclick={onAddNote}
		class="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 active:bg-amber-700 transition cursor-pointer"
	>
		+ Add Note
	</button>

	<button
		onclick={handleSignOut}
		disabled={isSigningOut}
		class="px-3 py-1.5 rounded-xl text-stone-500 text-sm hover:bg-stone-100 active:bg-stone-200 disabled:opacity-50 transition cursor-pointer"
	>
		Sign out
	</button>
</div>
