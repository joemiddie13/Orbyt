<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	let {
		note,
		screenX,
		screenY,
		screenWidth,
		screenHeight,
		scale,
		onSave,
		onClose,
		onDelete,
	}: {
		note: {
			_id: string;
			content: { text: string; color: number };
		};
		screenX: number;
		screenY: number;
		screenWidth: number;
		screenHeight: number;
		scale: number;
		onSave: (id: string, text: string, color: number) => void;
		onClose: () => void;
		onDelete: (id: string) => void;
	} = $props();

	const COLOR_OPTIONS: Array<{ value: number; name: string; hex: string }> = [
		{ value: 0xfff9c4, name: 'Yellow', hex: '#fff9c4' },
		{ value: 0xc8e6c9, name: 'Green', hex: '#c8e6c9' },
		{ value: 0xbbdefb, name: 'Blue', hex: '#bbdefb' },
		{ value: 0xf8bbd0, name: 'Pink', hex: '#f8bbd0' },
		{ value: 0xffe0b2, name: 'Orange', hex: '#ffe0b2' },
	];

	let editorElement: HTMLDivElement;
	let editor: Editor | null = $state(null);
	let editColor = $state(note.content.color);
	let editText = $state(note.content.text);

	/** Convert PixiJS hex number to CSS hex string */
	function colorToHex(color: number): string {
		const match = COLOR_OPTIONS.find(c => c.value === color);
		return match?.hex ?? '#fff9c4';
	}

	function handleClose() {
		const currentText = editor?.getHTML() ?? editText;
		const changed = currentText !== note.content.text || editColor !== note.content.color;
		if (changed) {
			onSave(note._id, currentText, editColor);
		}
		onClose();
	}

	function handleDelete() {
		onDelete(note._id);
	}

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
				}),
			],
			content: note.content.text,
			editable: true,
			autofocus: true,
			onUpdate: ({ editor: e }) => {
				editText = e.getHTML();
			},
			onTransaction: () => {
				// Force Svelte to re-render for toolbar active state
				editor = editor;
			},
		});
	});

	onDestroy(() => {
		editor?.destroy();
	});

	/** Handle keyboard shortcuts */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			handleClose();
		}
	}

	// Ensure minimum usable width regardless of zoom
	const editorWidth = $derived(Math.max(screenWidth, 280));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="inline-editor-backdrop" onclick={handleClose} onkeydown={onKeydown} role="presentation">
	<!-- Toolbar floats above the note -->
	<div
		class="inline-editor-toolbar"
		style="left: {screenX + editorWidth / 2}px; top: {screenY - 44}px;"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Color swatches -->
		<div class="toolbar-group">
			{#each COLOR_OPTIONS as color}
				<button
					type="button"
					onclick={() => { editColor = color.value; }}
					class="color-swatch"
					class:active={editColor === color.value}
					style="background-color: {color.hex};"
					title={color.name}
				></button>
			{/each}
		</div>

		<span class="toolbar-divider"></span>

		<!-- Formatting buttons -->
		{#if editor}
			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleBold().run()}
				class="toolbar-btn"
				class:active={editor.isActive('bold')}
			><strong>B</strong></button>
			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleItalic().run()}
				class="toolbar-btn"
				class:active={editor.isActive('italic')}
			><em>I</em></button>

			<span class="toolbar-divider"></span>

			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				class="toolbar-btn"
				class:active={editor.isActive('heading', { level: 1 })}
			>H1</button>
			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				class="toolbar-btn"
				class:active={editor.isActive('heading', { level: 2 })}
			>H2</button>
			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				class="toolbar-btn"
				class:active={editor.isActive('heading', { level: 3 })}
			>H3</button>

			<span class="toolbar-divider"></span>

			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleBulletList().run()}
				class="toolbar-btn"
				class:active={editor.isActive('bulletList')}
				title="Bullet list"
			>
				<svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
					<circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
				</svg>
			</button>
			<button
				type="button"
				onclick={() => editor?.chain().focus().toggleOrderedList().run()}
				class="toolbar-btn"
				class:active={editor.isActive('orderedList')}
				title="Numbered list"
			>
				<svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
					<text x="2" y="8" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">1</text>
					<text x="2" y="14" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">2</text>
					<text x="2" y="20" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">3</text>
				</svg>
			</button>
		{/if}

		<span class="toolbar-divider"></span>
		<button
			type="button"
			onclick={(e) => { e.stopPropagation(); handleDelete(); }}
			class="toolbar-btn delete-btn"
			title="Delete note"
		>
			<svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
				<path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
			</svg>
		</button>
	</div>

	<!-- Editor positioned at the note's screen location -->
	<div
		class="inline-editor-container"
		style="left: {screenX}px; top: {screenY}px; width: {editorWidth}px; background-color: {colorToHex(editColor)};"
		onclick={(e) => e.stopPropagation()}
	>
		<div bind:this={editorElement} class="inline-editor"></div>
	</div>
</div>

<style>
	.inline-editor-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.2);
	}

	.inline-editor-toolbar {
		position: fixed;
		z-index: 51;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 6px;
		background: #292524;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		width: fit-content;
		transform: translateX(-50%);
	}

	.toolbar-group {
		display: flex;
		gap: 3px;
		align-items: center;
	}

	.color-swatch {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.color-swatch.active {
		border-color: white;
		transform: scale(1.15);
	}

	.color-swatch:hover:not(.active) {
		transform: scale(1.1);
	}

	.toolbar-divider {
		width: 1px;
		height: 18px;
		background: #57534e;
		margin: 0 3px;
	}

	.toolbar-btn {
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		color: #d6d3d1;
		cursor: pointer;
		transition: background 0.1s;
		border: none;
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toolbar-btn:hover {
		background: #44403c;
	}

	.toolbar-btn.active {
		background: #f59e0b;
		color: white;
	}

	.toolbar-btn.delete-btn {
		color: #ef4444;
	}

	.toolbar-btn.delete-btn:hover {
		background: #7f1d1d;
		color: #fca5a5;
	}

	.toolbar-icon {
		width: 14px;
		height: 14px;
	}

	.inline-editor-container {
		position: fixed;
		z-index: 51;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(245, 158, 11, 0.5);
		max-height: 60vh;
		overflow-y: auto;
	}

	.inline-editor :global(.ProseMirror) {
		outline: none;
		padding: 16px;
		min-height: 60px;
		font-size: 0.875rem;
		line-height: 1.625;
		color: #292524;
	}

	.inline-editor :global(.ProseMirror h1) {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror h2) {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror h3) {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror p) {
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror ul) {
		padding-left: 1.25rem;
		list-style-type: disc;
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror ol) {
		padding-left: 1.25rem;
		list-style-type: decimal;
		margin: 0.25rem 0;
	}

	.inline-editor :global(.ProseMirror li) {
		margin-bottom: 0.125rem;
	}

	.inline-editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: 'Start typing...';
		color: #a8a29e;
		pointer-events: none;
		float: left;
		height: 0;
	}
</style>
