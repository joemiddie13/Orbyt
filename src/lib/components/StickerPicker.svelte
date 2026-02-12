<script lang="ts">
	import { STICKER_TYPES, getStickerEmoji } from '$lib/canvas/objects/StickerReaction';

	let {
		x,
		y,
		onSelect,
		onClose,
	}: {
		x: number;
		y: number;
		onSelect: (stickerType: string) => void;
		onClose: () => void;
	} = $props();

	// Position the picker near the long-press location but keep it on screen
	const left = $derived(Math.min(Math.max(x - 100, 8), window.innerWidth - 216));
	const top = $derived(Math.min(Math.max(y - 50, 8), window.innerHeight - 60));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50"
	onclick={onClose}
>
	<div
		class="absolute bg-white rounded-2xl shadow-2xl border border-stone-200 p-2 flex gap-1 flex-wrap"
		style="left: {left}px; top: {top}px; width: 208px;"
		onclick={(e) => e.stopPropagation()}
	>
		{#each STICKER_TYPES as type}
			<button
				onclick={() => onSelect(type)}
				class="w-10 h-10 rounded-xl hover:bg-stone-100 active:bg-stone-200 transition cursor-pointer flex items-center justify-center text-xl"
				title={type}
			>
				{getStickerEmoji(type)}
			</button>
		{/each}
	</div>
</div>
