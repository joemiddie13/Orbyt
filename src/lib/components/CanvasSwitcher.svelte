<script lang="ts">
	let {
		activeCanvasId,
		canvases,
		onSelect,
		onCreateNew,
		onClose,
	}: {
		activeCanvasId: string | null;
		canvases: any[] | undefined;
		onSelect: (canvasId: string, canvasName: string) => void;
		onCreateNew: () => void;
		onClose: () => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50"
	onclick={onClose}
>
	<div
		class="absolute top-16 left-1/2 -translate-x-1/2 glass-panel rounded-xl w-64 overflow-hidden"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="p-2">
			{#if canvases}
				{#each canvases as canvas}
					<button
						onclick={() => onSelect(canvas._id, canvas.name)}
						class="w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center gap-2 {canvas._id === activeCanvasId ? 'bg-amber-500/15 text-amber-400' : 'text-white/70 hover:bg-white/10'}"
					>
						{#if canvas.type === 'personal'}
							<span class="text-xs">🏠</span>
						{:else}
							<span class="text-xs">👥</span>
						{/if}
						<span class="flex-1 truncate">{canvas.name}</span>
						{#if canvas.role !== 'owner'}
							<span class="text-xs text-white/40">{canvas.role}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
		<div class="border-t border-white/[0.08] p-2">
			<button
				onclick={onCreateNew}
				class="w-full text-left px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-amber-500/15 transition cursor-pointer"
			>
				+ New shared canvas
			</button>
		</div>
	</div>
</div>
