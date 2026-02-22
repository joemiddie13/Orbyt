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
		class="absolute glass-panel rounded-lg overflow-hidden p-1.5 flex flex-col gap-1"
		style="left: {left}px; top: {top}px; min-width: 170px;"
		onclick={(e) => e.stopPropagation()}
	>
		<button
			onclick={onEditCaption}
			class="lego-btn lego-btn-sm lego-amber w-full justify-start gap-2"
		>
			<span class="text-base leading-none">✏️</span> Edit Caption
		</button>
		<button
			onclick={onDelete}
			class="lego-btn lego-btn-sm lego-red w-full justify-start gap-2"
		>
			<span class="text-base leading-none">🗑️</span> Delete Photo
		</button>
	</div>
</div>
