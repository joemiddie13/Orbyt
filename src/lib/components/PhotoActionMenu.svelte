<script lang="ts">
	let {
		x,
		y,
		onDelete,
		onEditCaption,
		onClose,
	}: {
		x: number;
		y: number;
		onDelete: () => void;
		onEditCaption: () => void;
		onClose: () => void;
	} = $props();

	const left = $derived(Math.min(Math.max(x - 80, 8), window.innerWidth - 176));
	const top = $derived(Math.min(Math.max(y - 40, 8), window.innerHeight - 100));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50"
	onclick={onClose}
>
	<div
		class="absolute bg-white rounded-xl shadow-2xl border border-stone-200 overflow-hidden"
		style="left: {left}px; top: {top}px; min-width: 160px;"
		onclick={(e) => e.stopPropagation()}
	>
		<button
			onclick={onEditCaption}
			class="w-full px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50 active:bg-stone-100 transition cursor-pointer flex items-center gap-2"
		>
			<span class="text-base">✏️</span> Edit Caption
		</button>
		<div class="h-px bg-stone-100"></div>
		<button
			onclick={onDelete}
			class="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 active:bg-red-100 transition cursor-pointer flex items-center gap-2"
		>
			<span class="text-base">🗑️</span> Delete Photo
		</button>
	</div>
</div>
