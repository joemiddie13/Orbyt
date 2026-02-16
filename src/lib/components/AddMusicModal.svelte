<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { animate } from 'motion';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		canvasId,
		onClose,
		onCreated,
	}: {
		canvasId: string;
		onClose: () => void;
		onCreated: () => void;
	} = $props();

	const client = useConvexClient();

	let urlInput = $state('');
	let loading = $state(false);
	let creating = $state(false);
	let error = $state('');
	let preview = $state<{
		platform: string;
		title: string;
		artist: string;
		thumbnailUrl?: string;
		embedUrl: string;
	} | null>(null);

	// Element refs
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let ambientOrb: HTMLDivElement;
	let header: HTMLDivElement;
	let contentBlock: HTMLDivElement;
	let musicLabel: HTMLElement;

	// Animation storage
	let entranceTl: gsap.core.Timeline | null = null;
	let breathTween: gsap.core.Tween | null = null;

	// Parallax
	let parallaxActive = $state(false);
	let grabbed = $state(false);
	let dragDistance = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let headerQX: ReturnType<typeof gsap.quickTo> | null = null;
	let headerQY: ReturnType<typeof gsap.quickTo> | null = null;
	let contentQX: ReturnType<typeof gsap.quickTo> | null = null;
	let contentQY: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQX: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQY: ReturnType<typeof gsap.quickTo> | null = null;

	const SNAP_DURATION = 0.8;
	const SNAP_EASE = 'elastic.out(1, 0.4)';
	const BASE_SHADOW = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';
	const SHIFT_CONTENT = 3;
	const SHIFT_ORB = 10;
	const PANEL_DRAG = 0.4;
	const PANEL_TILT = 0.035;
	const GRAB_CONTENT = 0.1;
	const GRAB_ORB = 0.3;

	const TEAL = '#14b8a6';
	const TEAL_RGB = '20, 184, 166';

	const PLATFORM_COLORS: Record<string, string> = {
		spotify: '#1DB954',
		youtube: '#FF0000',
		'youtube-music': '#FF0000',
		'apple-music': '#FC3C44',
	};

	const PLATFORM_RGB: Record<string, string> = {
		spotify: '29, 185, 84',
		youtube: '255, 0, 0',
		'youtube-music': '255, 0, 0',
		'apple-music': '252, 60, 68',
	};

	const PLATFORM_LABELS: Record<string, string> = {
		spotify: 'Spotify',
		youtube: 'YouTube',
		'youtube-music': 'YouTube Music',
		'apple-music': 'Apple Music',
	};

	/** Shift the ambient orb + label glow to a platform's brand color */
	function shiftToPlatformColor(platform: string) {
		const rgb = PLATFORM_RGB[platform];
		const hex = PLATFORM_COLORS[platform];
		if (!rgb || !hex || !ambientOrb || !musicLabel) return;

		// Shift ambient orb
		gsap.to(ambientOrb, {
			background: `radial-gradient(circle, rgba(${rgb}, 0.18) 0%, rgba(${rgb}, 0.08) 25%, rgba(${rgb}, 0.03) 50%, transparent 70%)`,
			duration: 0.8,
			ease: 'power2.out',
		});

		// Shift label color + breathing glow
		if (breathTween) breathTween.kill();
		gsap.to(musicLabel, { color: hex, duration: 0.5, ease: 'power2.out' });
		breathTween = gsap.to(musicLabel, {
			textShadow: `0 0 20px rgba(${rgb}, 0.8), 0 0 40px rgba(${rgb}, 0.4)`,
			duration: 1.5,
			ease: 'sine.inOut',
			repeat: -1,
			yoyo: true,
		});

		// Shift panel border glow
		if (panel) {
			const borderEl = panel.querySelector('.gradient-border') as HTMLElement;
			if (borderEl) {
				borderEl.style.setProperty('--glow-1', hex);
				borderEl.style.setProperty('--glow-2', `rgba(${rgb}, 0.3)`);
			}
		}
	}

	function initParallax() {
		if (!header || !contentBlock || !ambientOrb) return;
		headerQX = gsap.quickTo(header, 'x', { duration: 0.6, ease: 'power3.out' });
		headerQY = gsap.quickTo(header, 'y', { duration: 0.6, ease: 'power3.out' });
		contentQX = gsap.quickTo(contentBlock, 'x', { duration: 0.6, ease: 'power3.out' });
		contentQY = gsap.quickTo(contentBlock, 'y', { duration: 0.6, ease: 'power3.out' });
		orbQX = gsap.quickTo(ambientOrb, 'x', { duration: 0.6, ease: 'power3.out' });
		orbQY = gsap.quickTo(ambientOrb, 'y', { duration: 0.6, ease: 'power3.out' });
		parallaxActive = true;
	}

	function handleMouseDown(e: MouseEvent) {
		if (!parallaxActive) return;
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
		grabbed = true;
		dragDistance = 0;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
	}

	function handleMouseUp() {
		if (grabbed) {
			grabbed = false;
			snapBack();
		}
	}

	function snapBack() {
		headerQX = headerQY = contentQX = contentQY = orbQX = orbQY = null;
		if (panel) {
			gsap.to(panel, {
				x: 0, y: 0, rotationY: 0, rotationX: 0,
				transformPerspective: 800,
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		}
		if (header) gsap.to(header, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto', onComplete: initParallax });
		if (contentBlock) gsap.to(contentBlock, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
		if (ambientOrb) gsap.to(ambientOrb, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
	}

	function handleMouseMove(e: MouseEvent) {
		if (!parallaxActive) return;
		if (grabbed) dragDistance++;
		const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
		const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
		if (grabbed) {
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;
			if (panel) {
				gsap.to(panel, {
					x: dx * PANEL_DRAG, y: dy * PANEL_DRAG,
					rotationY: dx * PANEL_TILT, rotationX: -dy * PANEL_TILT,
					transformPerspective: 800,
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			}
			headerQX?.(dx * GRAB_CONTENT);
			headerQY?.(dy * GRAB_CONTENT);
			contentQX?.(dx * GRAB_CONTENT);
			contentQY?.(dy * GRAB_CONTENT);
			orbQX?.(dx * GRAB_ORB);
			orbQY?.(dy * GRAB_ORB);
		} else {
			headerQX?.(nx * SHIFT_CONTENT);
			headerQY?.(ny * SHIFT_CONTENT);
			contentQX?.(nx * SHIFT_CONTENT);
			contentQY?.(ny * SHIFT_CONTENT);
			orbQX?.(nx * SHIFT_ORB);
			orbQY?.(ny * SHIFT_ORB);
		}
	}

	function handleMouseLeave() {
		if (grabbed) { grabbed = false; snapBack(); return; }
		if (!parallaxActive) return;
		headerQX?.(0); headerQY?.(0);
		contentQX?.(0); contentQY?.(0);
		orbQX?.(0); orbQY?.(0);
	}

	async function fetchPreview() {
		if (!urlInput.trim()) { error = 'Paste a music link'; return; }
		loading = true;
		error = '';
		preview = null;

		try {
			const result = await client.action(api.music.fetchMusicMetadata, { url: urlInput.trim() });
			preview = result;
			// Shift glow to platform color on recognition
			if (result?.platform) shiftToPlatformColor(result.platform);
		} catch (err: any) {
			error = err.message || 'Failed to fetch metadata';
		} finally {
			loading = false;
		}
	}

	async function addToCanvas() {
		if (!preview) return;
		creating = true;
		error = '';

		try {
			// Place at a semi-random position (viewport center logic happens in +page.svelte)
			await client.mutation(api.music.createMusic, {
				canvasId: canvasId as any,
				position: { x: 400 + Math.random() * 600, y: 300 + Math.random() * 400 },
				url: urlInput.trim(),
				platform: preview.platform,
				title: preview.title,
				artist: preview.artist,
				thumbnailUrl: preview.thumbnailUrl,
				embedUrl: preview.embedUrl,
			});
			onCreated();
		} catch (err: any) {
			error = err.message || 'Failed to add music';
			creating = false;
		}
	}

	function handleClose() {
		parallaxActive = false;
		grabbed = false;
		const closeTl = gsap.timeline({ onComplete: () => onClose() });
		closeTl.to(panel, { scale: 0.95, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0);
		closeTl.to(backdrop, { opacity: 0, duration: 0.2 }, 0.1);
	}

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
		const sections = contentBlock?.children ? Array.from(contentBlock.children) : [];
		entranceTl = gsap.timeline();
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0 },
			{ scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);
		entranceTl.fromTo(header,
			{ y: 12, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
			0.25
		);
		sections.forEach((section, i) => {
			entranceTl!.fromTo(section as HTMLElement,
				{ y: 10, opacity: 0 },
				{ y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
				0.32 + i * 0.06
			);
		});
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 40px rgba(${TEAL_RGB}, 0.3), inset 0 0 20px rgba(${TEAL_RGB}, 0.06)`,
			duration: 0.4, ease: 'power2.in',
		}, 0.3);
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 8px rgba(${TEAL_RGB}, 0.1), inset 0 0 8px rgba(${TEAL_RGB}, 0.02)`,
			duration: 0.6, ease: 'power2.out',
		}, 0.7);
		entranceTl.call(() => { initParallax(); }, [], '+=0');

		// Start breathing glow on "MUSIC LINK" label
		if (musicLabel) {
			breathTween = gsap.to(musicLabel, {
				textShadow: `0 0 20px rgba(${TEAL_RGB}, 0.8), 0 0 40px rgba(${TEAL_RGB}, 0.4)`,
				duration: 1.5,
				ease: 'sine.inOut',
				repeat: -1,
				yoyo: true,
			});
		}
	});

	onDestroy(() => {
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
		if (breathTween) { breathTween.kill(); breathTween = null; }
		parallaxActive = false;
		grabbed = false;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={backdrop}
	class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget && dragDistance < 5) handleClose(); }}
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	style:cursor={grabbed ? 'grabbing' : parallaxActive ? 'grab' : undefined}
	style:user-select={grabbed ? 'none' : undefined}
>
	<div bind:this={panel} class="glass-panel rounded-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col relative" style="will-change: transform, box-shadow;">

		<!-- Flowing gradient border -->
		<div class="gradient-border"></div>

		<!-- Ambient orb -->
		<div bind:this={ambientOrb} class="ambient-orb"></div>

		<div bind:this={header} class="px-6 pt-4 pb-0 flex-shrink-0 relative z-10">
			<!-- empty for parallax anchor -->
		</div>

		<div bind:this={contentBlock} class="flex-1 overflow-y-auto px-6 pb-5 pt-2 relative z-10" style="display: flex; flex-direction: column; gap: 0.75rem;">

			<!-- Label + close button on same row -->
			<div class="flex items-center relative">
				<label bind:this={musicLabel} class="text-base font-semibold uppercase tracking-wider text-center flex-1" style="font-family: 'Geist Mono', monospace; color: {TEAL}; text-shadow: 0 0 8px rgba({TEAL_RGB}, 0.3);">Music Link</label>
				<button
					onclick={handleClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer absolute right-0"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- URL input -->
			<div>
				<div class="flex gap-2">
					<input
						type="url"
						bind:value={urlInput}
						placeholder="Paste Spotify, YouTube, or Apple Music link..."
						class="glass-input flex-1 rounded-lg px-3 py-2.5 text-base"
						style="font-family: 'Geist Mono', monospace;"
						onkeydown={(e) => { if (e.key === 'Enter') fetchPreview(); }}
					/>
					<button
						onclick={fetchPreview}
						disabled={loading || !urlInput.trim()}
						class="lego-btn lego-teal"
					>
						{loading ? '...' : 'Preview'}
					</button>
				</div>
			</div>

			<!-- Supported platforms -->
			<div class="flex items-center gap-4 flex-wrap">
				<span class="platform-chip">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
					<span class="text-sm text-white/40" style="font-family: 'Geist Mono', monospace;">Spotify</span>
				</span>
				<span class="platform-chip">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
					<span class="text-sm text-white/40" style="font-family: 'Geist Mono', monospace;">YouTube</span>
				</span>
				<span class="platform-chip">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="#FF0000"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 21.6c-5.292 0-9.6-4.308-9.6-9.6S6.708 2.4 12 2.4s9.6 4.308 9.6 9.6-4.308 9.6-9.6 9.6z"/><path d="M16.758 11.136l-6.6-4.2A1.05 1.05 0 0 0 8.6 7.8v8.4a1.05 1.05 0 0 0 1.558.864l6.6-4.2a.96.96 0 0 0 0-1.728z"/></svg>
					<span class="text-sm text-white/40" style="font-family: 'Geist Mono', monospace;">YouTube Music</span>
				</span>
				<span class="platform-chip">
					<svg width="14" height="14" viewBox="0 0 361 361" fill="#FC3C44"><path d="M255.5 0h-150C47.3 0 0 47.3 0 105.5v150C0 313.7 47.3 361 105.5 361h150c58.2 0 105.5-47.3 105.5-105.5v-150C361 47.3 313.7 0 255.5 0zM281 237.6c0 25.5-17.8 46.2-43.1 52.4-5.8 1.4-11.5 2.1-16.7 2.1-10.7 0-19.8-3.2-26.1-9.5-8.4-8.4-11.1-20.5-7.4-33.2 5.2-18 21.3-30 40.7-33.5l28.6-5.3V152l-96 20.5v88.1c0 25.5-17.8 46.2-43.1 52.4-5.8 1.4-11.5 2.1-16.7 2.1-10.7 0-19.8-3.2-26.1-9.5-8.4-8.4-11.1-20.5-7.4-33.2 5.2-18 21.3-30 40.7-33.5l28.6-5.3V111.4c0-10.7 7.1-20 17.4-22.2l111-24.8c6.3-1.4 12.9-.1 17.9 3.6 5 3.7 7.9 9.5 7.9 15.8V237.6z"/></svg>
					<span class="text-sm text-white/40" style="font-family: 'Geist Mono', monospace;">Apple Music</span>
				</span>
			</div>

			<!-- Preview card -->
			{#if preview}
				<div class="preview-card">
					{#if preview.thumbnailUrl}
						<img
							src={preview.thumbnailUrl}
							alt={preview.title}
							class="preview-thumb"
							crossorigin="anonymous"
						/>
					{:else}
						<div class="preview-thumb-placeholder">
							<span class="text-2xl">&#x1F3B5;</span>
						</div>
					{/if}
					<div class="preview-info">
						<p class="text-base font-semibold text-white truncate" style="font-family: 'Geist Mono', monospace;">{preview.title}</p>
						{#if preview.artist}
							<p class="text-sm text-white/60 truncate" style="font-family: 'Geist Mono', monospace;">{preview.artist}</p>
						{/if}
						<span class="text-xs font-medium mt-1 inline-block" style="color: {PLATFORM_COLORS[preview.platform] ?? '#888'}; font-family: 'Geist Mono', monospace;">{PLATFORM_LABELS[preview.platform] ?? preview.platform}</span>
					</div>
				</div>
			{/if}

			<!-- Error -->
			{#if error}
				<p class="text-sm text-red-400" style="font-family: 'Geist Mono', monospace;">{error}</p>
			{/if}

			<!-- Add to Canvas button -->
			{#if preview}
				<button
					onclick={addToCanvas}
					disabled={creating}
					class="lego-btn lego-btn-full lego-teal cursor-pointer"
				>
					{creating ? 'Adding...' : 'Add to Canvas'}
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Flowing gradient border — rotating conic gradient */
	.gradient-border {
		--glow-1: #14b8a6;
		--glow-2: rgba(20, 184, 166, 0.3);
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		padding: 1px;
		background: conic-gradient(
			from var(--border-angle, 0deg),
			transparent 0%,
			var(--glow-1) 10%,
			transparent 20%,
			transparent 50%,
			var(--glow-2) 60%,
			transparent 70%
		);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		animation: border-spin 4s linear infinite;
		pointer-events: none;
		z-index: 1;
	}

	@keyframes border-spin {
		to { --border-angle: 360deg; }
	}

	@property --border-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}

	.ambient-orb {
		position: absolute;
		top: 35%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 420px;
		height: 420px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(20, 184, 166, 0.12) 0%, rgba(20, 184, 166, 0.06) 25%, rgba(20, 184, 166, 0.02) 50%, transparent 70%);
		pointer-events: none;
		will-change: transform, opacity;
	}

	.platform-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.preview-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		background: rgba(26, 26, 46, 0.8);
		border: 1px solid rgba(42, 42, 62, 0.8);
	}

	.preview-thumb {
		width: 60px;
		height: 60px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.preview-thumb-placeholder {
		width: 60px;
		height: 60px;
		border-radius: 8px;
		background: rgba(42, 42, 62, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.preview-info {
		flex: 1;
		min-width: 0;
	}
</style>
