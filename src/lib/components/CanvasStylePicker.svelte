<script lang="ts">
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	type OverlayMode = 'none' | 'dots' | 'lines';

	let {
		activeMode,
		onchange,
		onpreview,
	}: {
		activeMode: OverlayMode;
		onchange: (mode: OverlayMode) => void;
		onpreview: (mode: OverlayMode) => void;
	} = $props();

	let open = $state(false);
	let popover = $state<HTMLDivElement>(undefined!);
	let trigger = $state<HTMLButtonElement>(undefined!);

	const OPTIONS: { mode: OverlayMode; label: string }[] = [
		{ mode: 'lines', label: 'Lines' },
		{ mode: 'dots', label: 'Dots' },
		{ mode: 'none', label: 'None' },
	];

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			requestAnimationFrame(() => {
				if (!popover) return;
				gsap.fromTo(popover,
					{ scale: 0.6, opacity: 0, transformOrigin: 'bottom left' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
			});
		}
	}

	function close() {
		if (!open || !popover) { open = false; return; }
		// Revert preview to the committed mode
		onpreview(activeMode);
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'bottom left',
			onComplete: () => { open = false; },
		});
	}

	function select(mode: OverlayMode) {
		onchange(mode);
		// Skip revert — close without preview reset since we're committing this mode
		if (!open || !popover) { open = false; return; }
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'bottom left',
			onComplete: () => { open = false; },
		});
	}

	function preview(mode: OverlayMode) {
		onpreview(mode);
	}

	function handleClickOutside(e: MouseEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (trigger?.contains(target) || popover?.contains(target)) return;
		close();
	}

	onMount(() => {
		document.addEventListener('pointerdown', handleClickOutside);
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('pointerdown', handleClickOutside);
		}
	});
</script>

<div class="picker-root">
	{#if open}
		<div bind:this={popover} class="picker-popover" onpointerleave={() => preview(activeMode)}>
			{#each OPTIONS as opt}
				<button
					class="picker-option"
					class:active={activeMode === opt.mode}
					onclick={() => select(opt.mode)}
					onpointerenter={() => preview(opt.mode)}
					title={opt.label}
				>
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
						{#if opt.mode === 'none'}
							<!-- Prohibition circle -->
							<circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.3" fill="none" />
							<line x1="4.4" y1="4.4" x2="13.6" y2="13.6" stroke="currentColor" stroke-width="1.3" />
						{:else if opt.mode === 'dots'}
							<!-- 3x3 dot grid -->
							{#each [4.5, 9, 13.5] as cx}
								{#each [4.5, 9, 13.5] as cy}
									<circle {cx} {cy} r="1.4" fill="currentColor" />
								{/each}
							{/each}
						{:else}
							<!-- Grid lines -->
							<line x1="6" y1="2.5" x2="6" y2="15.5" stroke="currentColor" stroke-width="1" />
							<line x1="12" y1="2.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="1" />
							<line x1="2.5" y1="6" x2="15.5" y2="6" stroke="currentColor" stroke-width="1" />
							<line x1="2.5" y1="12" x2="15.5" y2="12" stroke="currentColor" stroke-width="1" />
						{/if}
					</svg>
				</button>
			{/each}
		</div>
	{/if}

	<button
		bind:this={trigger}
		class="picker-trigger"
		class:open
		onclick={toggle}
		title="Canvas style"
	>
		<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
			{#if activeMode === 'dots'}
				{#each [4.5, 9, 13.5] as cx}
					{#each [4.5, 9, 13.5] as cy}
						<circle {cx} {cy} r="1.4" fill="currentColor" />
					{/each}
				{/each}
			{:else if activeMode === 'lines'}
				<line x1="6" y1="2.5" x2="6" y2="15.5" stroke="currentColor" stroke-width="1" />
				<line x1="12" y1="2.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="1" />
				<line x1="2.5" y1="6" x2="15.5" y2="6" stroke="currentColor" stroke-width="1" />
				<line x1="2.5" y1="12" x2="15.5" y2="12" stroke="currentColor" stroke-width="1" />
			{:else}
				<!-- Default: generic grid icon -->
				<rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3" fill="none" />
				<line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="1" />
				<line x1="9" y1="3" x2="9" y2="15" stroke="currentColor" stroke-width="1" />
			{/if}
		</svg>
	</button>
</div>

<style>
	.picker-root {
		position: fixed;
		bottom: 24px;
		left: 24px;
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.picker-trigger {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(15, 14, 26, 0.75);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
	}

	.picker-trigger:hover,
	.picker-trigger.open {
		color: rgba(191, 169, 138, 0.9);
		border-color: rgba(191, 169, 138, 0.25);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 8px rgba(191, 169, 138, 0.1);
	}

	.picker-popover {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		border-radius: 14px;
		background: rgba(15, 14, 26, 0.82);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
	}

	.picker-option {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid transparent;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		transition: all 0.15s;
	}

	.picker-option:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.06);
	}

	.picker-option.active {
		color: #BFA98A;
		background: rgba(191, 169, 138, 0.12);
		border-color: rgba(191, 169, 138, 0.2);
	}
</style>
