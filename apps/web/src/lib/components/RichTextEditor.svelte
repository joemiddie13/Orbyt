<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	let {
		content,
		editable,
		onUpdate,
	}: {
		content: string;
		editable: boolean;
		onUpdate?: (html: string) => void;
	} = $props();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = $state(null);

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
				}),
			],
			content,
			editable,
			onUpdate: ({ editor: e }) => {
				onUpdate?.(e.getHTML());
			},
			onTransaction: () => {
				// Force Svelte to re-render for active state updates
				editor = editor;
			},
		});
	});

	onDestroy(() => {
		editor?.destroy();
	});
</script>

{#if editable && editor}
	<div class="flex flex-wrap gap-1 mb-2 p-1.5 rounded-lg bg-stone-100 border border-stone-200">
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleBold().run()}
			class="lego-toggle {editor.isActive('bold') ? 'active' : ''}"
			style="font-style: normal;"
		>B</button>
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleItalic().run()}
			class="lego-toggle {editor.isActive('italic') ? 'active' : ''}"
			style="font-style: italic;"
		>I</button>

		<span class="w-px h-5 bg-stone-300 self-center mx-0.5"></span>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
			class="lego-toggle {editor.isActive('heading', { level: 1 }) ? 'active' : ''}"
		>H1</button>
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
			class="lego-toggle {editor.isActive('heading', { level: 2 }) ? 'active' : ''}"
		>H2</button>
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
			class="lego-toggle {editor.isActive('heading', { level: 3 }) ? 'active' : ''}"
		>H3</button>

		<span class="w-px h-5 bg-stone-300 self-center mx-0.5"></span>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleBulletList().run()}
			class="lego-toggle {editor.isActive('bulletList') ? 'active' : ''}"
		>
			<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
				<circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
			</svg>
		</button>
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleOrderedList().run()}
			class="lego-toggle {editor.isActive('orderedList') ? 'active' : ''}"
		>
			<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
				<text x="2" y="8" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">1</text>
				<text x="2" y="14" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">2</text>
				<text x="2" y="20" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">3</text>
			</svg>
		</button>
	</div>
{/if}

<div bind:this={editorElement} class="rich-text-editor {editable ? 'editable' : 'readonly'}"></div>

<style>
	.rich-text-editor :global(.ProseMirror) {
		outline: none;
		min-height: 120px;
		font-size: 0.875rem;
		line-height: 1.625;
		color: #292524;
	}

	.rich-text-editor.editable :global(.ProseMirror) {
		padding: 0.75rem;
		border: 1px solid #e7e5e4;
		border-radius: 0.75rem;
		min-height: 160px;
	}

	.rich-text-editor.editable :global(.ProseMirror:focus) {
		outline: none;
		box-shadow: 0 0 0 2px #fcd34d;
		border-color: transparent;
	}

	.rich-text-editor.readonly :global(.ProseMirror) {
		padding: 0;
		min-height: 0;
	}

	.rich-text-editor :global(.ProseMirror h1) {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror h2) {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror h3) {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror p) {
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror ul) {
		padding-left: 1.25rem;
		list-style-type: disc;
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror ol) {
		padding-left: 1.25rem;
		list-style-type: decimal;
		margin: 0.25rem 0;
	}

	.rich-text-editor :global(.ProseMirror li) {
		margin-bottom: 0.125rem;
	}

	.rich-text-editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: #a8a29e;
		pointer-events: none;
		float: left;
		height: 0;
	}
</style>
