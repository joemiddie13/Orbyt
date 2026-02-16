<script lang="ts">
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		activeCanvasId,
		canvases,
		canvasName = 'My Canvas',
		onSelect,
		onCreateNew,
	}: {
		activeCanvasId: string | null;
		canvases: any[] | undefined;
		canvasName?: string;
		onSelect: (canvasId: string, canvasName: string) => void;
		onCreateNew: () => void;
	} = $props();

	let open = $state(false);
	let popover = $state<HTMLDivElement>(undefined!);
	let trigger = $state<HTMLButtonElement>(undefined!);
	let chevron = $state<SVGElement>(undefined!);

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			requestAnimationFrame(() => {
				if (!popover) return;
				gsap.fromTo(popover,
					{ scale: 0.6, opacity: 0, transformOrigin: 'top left' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
				if (chevron) {
					gsap.to(chevron, { rotation: 180, duration: 0.2, ease: 'power2.out' });
				}
			});
		}
	}

	function close() {
		if (!open || !popover) { open = false; return; }
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'top left',
			onComplete: () => { open = false; },
		});
		if (chevron) {
			gsap.to(chevron, { rotation: 0, duration: 0.15, ease: 'power2.in' });
		}
	}

	function select(canvasId: string, name: string) {
		onSelect(canvasId, name);
		close();
	}

	function createNew() {
		onCreateNew();
		close();
	}

	function handleClickOutside(e: MouseEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (trigger?.contains(target) || popover?.contains(target)) return;
		close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
			e.stopPropagation();
		}
	}

	onMount(() => {
		document.addEventListener('pointerdown', handleClickOutside);
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('pointerdown', handleClickOutside);
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<div class="switcher-root">
	<button
		bind:this={trigger}
		class="switcher-trigger"
		class:open
		onclick={toggle}
	>
		{canvasName}
		<svg bind:this={chevron} class="chevron" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<div bind:this={popover} class="switcher-popover">
			<div class="switcher-list">
				{#if canvases}
					{#each canvases as canvas}
						<button
							onclick={() => select(canvas._id, canvas.name)}
							class="canvas-item"
							class:active={canvas._id === activeCanvasId}
						>
							<span class="canvas-icon">
								{#if canvas.type === 'personal'}🏠{:else}👥{/if}
							</span>
							<span class="canvas-name">{canvas.name}</span>
							{#if canvas.role !== 'owner'}
								<span class="canvas-role">{canvas.role}</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
			<div class="switcher-footer">
				<button onclick={createNew} class="create-btn">
					+ New shared canvas
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.switcher-root {
		position: relative;
		display: inline-flex;
	}

	.switcher-trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 8px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.6);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.2s, background 0.2s;
	}

	.switcher-trigger:hover,
	.switcher-trigger.open {
		color: rgba(255, 255, 255, 0.85);
		background: rgba(255, 255, 255, 0.1);
	}

	.chevron {
		flex-shrink: 0;
	}

	.switcher-popover {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		width: 256px;
		border-radius: 14px;
		background: rgba(15, 14, 26, 0.82);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
		z-index: 50;
		overflow: hidden;
	}

	.switcher-list {
		padding: 6px;
	}

	.canvas-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.7);
		transition: all 0.15s;
	}

	.canvas-item:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.canvas-item.active {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
	}

	.canvas-icon {
		font-size: 12px;
		flex-shrink: 0;
	}

	.canvas-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.canvas-role {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.35);
		flex-shrink: 0;
	}

	.switcher-footer {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		padding: 6px;
	}

	.create-btn {
		width: 100%;
		text-align: left;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		color: #fbbf24;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	.create-btn:hover {
		background: rgba(245, 158, 11, 0.12);
	}
</style>
