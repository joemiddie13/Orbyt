<script lang="ts">
	/**
	 * ViewerAvatars — floating pill showing who's viewing the current canvas.
	 * Colored initial circles + "N viewing" text, top-right corner.
	 */

	const AVATAR_COLORS = [
		'#4FC3F7', '#AED581', '#FFB74D', '#F06292', '#BA68C8',
		'#4DB6AC', '#FFD54F', '#FF8A65', '#7986CB', '#A1887F',
	];

	let {
		viewers,
		currentUserId,
	}: {
		viewers: Array<{ userId: string; username: string; displayName: string }>;
		currentUserId: string;
	} = $props();

	// Filter out the current user — only show others
	let otherViewers = $derived(viewers.filter((v) => v.userId !== currentUserId));

	function getColor(userId: string): string {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = (hash * 31 + userId.charCodeAt(i)) | 0;
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	}

	function getInitial(viewer: { displayName: string; username: string }): string {
		return (viewer.displayName || viewer.username).charAt(0).toUpperCase();
	}
</script>

{#if otherViewers.length > 0}
	<div class="fixed top-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border border-stone-200/50">
		<div class="flex -space-x-2">
			{#each otherViewers.slice(0, 5) as viewer (viewer.userId)}
				<div
					class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white"
					style="background-color: {getColor(viewer.userId)}"
					title={viewer.displayName || viewer.username}
				>
					{getInitial(viewer)}
				</div>
			{/each}
		</div>
		<span class="text-xs text-stone-500 font-medium">
			{otherViewers.length} viewing
		</span>
	</div>
{/if}
