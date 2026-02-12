<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let {
		activeCanvasId,
		onSelect,
		onCreateNew,
		onClose,
	}: {
		activeCanvasId: string | null;
		onSelect: (canvasId: string, canvasName: string) => void;
		onCreateNew: () => void;
		onClose: () => void;
	} = $props();

	const canvases = useQuery(api.access.getAccessibleCanvases, {});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50"
	onclick={onClose}
>
	<div
		class="absolute top-16 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-stone-200 w-64 overflow-hidden"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="p-2">
			{#if canvases.data}
				{#each canvases.data as canvas}
					<button
						onclick={() => onSelect(canvas._id, canvas.name)}
						class="w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer flex items-center gap-2 {canvas._id === activeCanvasId ? 'bg-amber-50 text-amber-700' : 'text-stone-700 hover:bg-stone-50'}"
					>
						{#if canvas.type === 'personal'}
							<span class="text-xs">🏠</span>
						{:else}
							<span class="text-xs">👥</span>
						{/if}
						<span class="flex-1 truncate">{canvas.name}</span>
						{#if canvas.role !== 'owner'}
							<span class="text-xs text-stone-400">{canvas.role}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
		<div class="border-t border-stone-100 p-2">
			<button
				onclick={onCreateNew}
				class="w-full text-left px-3 py-2 rounded-lg text-sm text-amber-600 hover:bg-amber-50 transition cursor-pointer"
			>
				+ New shared canvas
			</button>
		</div>
	</div>
</div>
