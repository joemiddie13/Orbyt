<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import RichTextEditor from './RichTextEditor.svelte';

	let {
		note,
		isOwner,
		onClose,
		onDeleted,
	}: {
		note: {
			_id: string;
			content: { text: string; color: number };
			creatorId: string;
		};
		isOwner: boolean;
		onClose: () => void;
		onDeleted: () => void;
	} = $props();

	const client = useConvexClient();

	let editText = $state(note.content.text);
	let editColor = $state(note.content.color);
	let saving = $state(false);
	let deleting = $state(false);

	const isModified = $derived(editText !== note.content.text || editColor !== note.content.color);

	/** Color swatches for the picker */
	const COLOR_OPTIONS: Array<{ value: number; name: string; bg: string; dot: string; ring: string }> = [
		{ value: 0xfff9c4, name: 'Yellow', bg: 'bg-yellow-100', dot: 'bg-yellow-300', ring: 'ring-yellow-400' },
		{ value: 0xc8e6c9, name: 'Green', bg: 'bg-green-100', dot: 'bg-green-300', ring: 'ring-green-400' },
		{ value: 0xbbdefb, name: 'Blue', bg: 'bg-blue-100', dot: 'bg-blue-300', ring: 'ring-blue-400' },
		{ value: 0xf8bbd0, name: 'Pink', bg: 'bg-pink-100', dot: 'bg-pink-300', ring: 'ring-pink-400' },
		{ value: 0xffe0b2, name: 'Orange', bg: 'bg-orange-100', dot: 'bg-orange-300', ring: 'ring-orange-400' },
	];

	const activeColor = $derived(COLOR_OPTIONS.find(c => c.value === editColor) ?? COLOR_OPTIONS[0]);

	/** Check if content is empty (Tiptap wraps empty content in <p></p>) */
	function isContentEmpty(html: string): boolean {
		const stripped = html.replace(/<[^>]*>/g, '').trim();
		return stripped.length === 0;
	}

	async function save() {
		if (!isModified || isContentEmpty(editText)) return;
		saving = true;
		try {
			await client.mutation(api.objects.updateContent, {
				id: note._id as any,
				content: { text: editText, color: editColor },
			});
			onClose();
		} catch (err) {
			console.error('Failed to save note:', err);
		} finally {
			saving = false;
		}
	}

	async function deleteNote() {
		deleting = true;
		try {
			await client.mutation(api.objects.remove, {
				id: note._id as any,
			});
			onDeleted();
		} catch (err) {
			console.error('Failed to delete note:', err);
		} finally {
			deleting = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden max-h-[80vh] flex flex-col">
		<!-- Header -->
		<div class="p-6 pb-3 flex-shrink-0 {activeColor.bg}">
			<div class="flex items-center justify-between mb-2">
				<div class="flex items-center gap-2">
					<span class="w-3 h-3 rounded-full {activeColor.dot}"></span>
					<h2 class="text-lg font-bold text-stone-800">{activeColor.name} Note</h2>
				</div>
				<button
					onclick={onClose}
					class="text-stone-400 hover:text-stone-600 transition cursor-pointer flex-shrink-0"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Color picker (owner only) -->
			{#if isOwner}
				<div class="flex gap-2 mt-2">
					{#each COLOR_OPTIONS as color}
						<button
							type="button"
							onclick={() => { editColor = color.value; }}
							class="w-7 h-7 rounded-full transition cursor-pointer {color.dot} {editColor === color.value ? 'ring-2 ring-offset-2 ' + color.ring : 'hover:scale-110'}"
							title={color.name}
						></button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto px-6 py-4">
			{#if isOwner}
				<RichTextEditor
					content={note.content.text}
					editable={true}
					onUpdate={(html) => { editText = html; }}
				/>
			{:else}
				<RichTextEditor
					content={note.content.text}
					editable={false}
				/>
			{/if}
		</div>

		<!-- Actions -->
		{#if isOwner}
			<div class="px-6 py-4 flex gap-2 flex-shrink-0 border-t border-stone-100">
				{#if isModified}
					<button
						onclick={save}
						disabled={saving || isContentEmpty(editText)}
						class="flex-1 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50 bg-amber-500 text-white hover:bg-amber-600"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>
				{/if}
				<button
					onclick={deleteNote}
					disabled={deleting}
					class="py-2.5 px-4 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50 bg-red-50 text-red-600 hover:bg-red-100"
				>
					{deleting ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		{/if}
	</div>
</div>
