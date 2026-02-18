<script lang="ts">
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		activeCanvasId,
		canvases,
		canvasName = 'My Orbyt',
		onSelect,
		onCreateNew,
		onSettings,
		activeBeaconCanvasIds = [],
	}: {
		activeCanvasId: string | null;
		canvases: any[] | undefined;
		canvasName?: string;
		onSelect: (canvasId: string, canvasName: string) => void;
		onCreateNew: () => void;
		onSettings?: (canvasId: string, canvasName: string) => void;
		activeBeaconCanvasIds?: string[];
	} = $props();

	const beaconCanvasSet = $derived(new Set(activeBeaconCanvasIds));

	// Sort: personal first → beacons → recently visited → alphabetical
	const sortedCanvases = $derived.by(() => {
		if (!canvases) return [];
		return [...canvases].sort((a, b) => {
			// Personal Orbyt always first
			const aPersonal = a.type === 'personal' && a.role === 'owner' ? 1 : 0;
			const bPersonal = b.type === 'personal' && b.role === 'owner' ? 1 : 0;
			if (aPersonal !== bPersonal) return bPersonal - aPersonal;
			// Active beacons next
			const aBeacon = beaconCanvasSet.has(a._id) ? 1 : 0;
			const bBeacon = beaconCanvasSet.has(b._id) ? 1 : 0;
			if (aBeacon !== bBeacon) return bBeacon - aBeacon;
			// Most recently visited
			const aTime = a.lastAccessedAt ?? 0;
			const bTime = b.lastAccessedAt ?? 0;
			if (aTime !== bTime) return bTime - aTime;
			// Alphabetical fallback
			return a.name.localeCompare(b.name);
		});
	});

	// Search filter — only shows when 8+ canvases
	let searchQuery = $state('');
	let searchInput = $state<HTMLInputElement>(undefined!);
	const showSearch = $derived((canvases?.length ?? 0) >= 8);
	const filteredCanvases = $derived.by(() => {
		if (!searchQuery.trim()) return sortedCanvases;
		const q = searchQuery.toLowerCase().trim();
		return sortedCanvases.filter((c) => c.name.toLowerCase().includes(q));
	});

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
				if (showSearch && searchInput) {
					searchInput.focus();
				}
			});
		}
	}

	function close() {
		searchQuery = '';
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
			{#if showSearch}
				<div class="switcher-search">
					<input
						bind:this={searchInput}
						bind:value={searchQuery}
						type="text"
						placeholder="Search Orbyts..."
						class="search-input"
					/>
				</div>
			{/if}
			<div class="switcher-list">
				{#each filteredCanvases as canvas}
					<button
						onclick={() => select(canvas._id, canvas.name)}
						class="canvas-item"
						class:active={canvas._id === activeCanvasId}
						class:has-beacon={beaconCanvasSet.has(canvas._id)}
					>
						<span class="canvas-icon">
							{#if canvas.type === 'personal'}🏠{:else}👥{/if}
						</span>
						<span class="canvas-name">{canvas.name}</span>
						{#if onSettings && canvas.type === 'shared' && canvas.role === 'owner'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								role="button"
								tabindex="-1"
								onclick={(e) => { e.stopPropagation(); onSettings(canvas._id, canvas.name); close(); }}
								onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSettings(canvas._id, canvas.name); close(); } }}
								class="settings-btn"
								title="Orbyt settings"
							>
								<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
									<path d="M11.5 1h-3l-.4 2.4a6.5 6.5 0 00-1.8 1l-2.3-.8L2.4 6.2l1.5 1.9a6.5 6.5 0 000 2l-1.5 1.9 1.6 2.6 2.3-.8a6.5 6.5 0 001.8 1L8.5 17h3l.4-2.4a6.5 6.5 0 001.8-1l2.3.8 1.6-2.6-1.5-1.9a6.5 6.5 0 000-2l1.5-1.9-1.6-2.6-2.3.8a6.5 6.5 0 00-1.8-1L11.5 1zM10 13a3 3 0 110-6 3 3 0 010 6z" fill-rule="evenodd"/>
								</svg>
							</span>
						{/if}
						{#if beaconCanvasSet.has(canvas._id)}
							<svg class="beacon-icon" width="14" height="14" viewBox="0 0 20 20" fill="none">
								<circle cx="10" cy="14" r="2" fill="#f5a623" opacity="0.95"/>
								<path d="M6.5 10 A5 5 0 0 1 13.5 10" stroke="#f5a623" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.7"/>
								<path d="M4 7 A8 8 0 0 1 16 7" stroke="#f5a623" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.4"/>
							</svg>
						{/if}
						{#if canvas.role !== 'owner'}
							<span class="canvas-role">{canvas.role}</span>
						{/if}
					</button>
				{/each}
				{#if showSearch && filteredCanvases.length === 0}
					<p class="no-results">No Orbyts match</p>
				{/if}
			</div>
			<div class="switcher-footer">
				<button onclick={createNew} class="create-btn">
					+ New shared Orbyt
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

	.switcher-search {
		padding: 6px 6px 0;
	}

	.search-input {
		width: 100%;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.85);
		font-size: 13px;
		outline: none;
		transition: border-color 0.15s;
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.search-input:focus {
		border-color: rgba(251, 191, 36, 0.4);
	}

	.switcher-list {
		padding: 6px;
		max-height: 320px;
		overflow-y: auto;
	}

	.switcher-list::-webkit-scrollbar {
		width: 4px;
	}

	.switcher-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.switcher-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
	}

	.no-results {
		padding: 12px 10px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.35);
		text-align: center;
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

	.settings-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		border: none;
		background: transparent;
		color: rgba(255, 255, 255, 0.3);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s, background 0.15s;
	}

	.canvas-item:hover .settings-btn {
		opacity: 1;
	}

	.settings-btn:hover {
		color: rgba(255, 255, 255, 0.7);
		background: rgba(255, 255, 255, 0.08);
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

	/* Warm pulse ring for canvases with active friend beacons */
	.canvas-item.has-beacon {
		box-shadow: inset 0 0 0 1px rgba(245, 166, 35, 0.3);
		animation: beaconPulse 2.5s ease-in-out infinite;
	}

	@keyframes beaconPulse {
		0%, 100% { box-shadow: inset 0 0 0 1px rgba(245, 166, 35, 0.2); }
		50% { box-shadow: inset 0 0 0 1.5px rgba(245, 166, 35, 0.45), 0 0 8px rgba(245, 166, 35, 0.15); }
	}

	.beacon-icon {
		flex-shrink: 0;
		animation: beaconIconPulse 2.5s ease-in-out infinite;
	}

	@keyframes beaconIconPulse {
		0%, 100% { opacity: 0.6; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.15); }
	}
</style>
