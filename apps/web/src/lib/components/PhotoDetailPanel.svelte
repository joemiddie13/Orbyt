<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import gsap from 'gsap';
	import { animate } from 'motion';
	import { onMount, onDestroy } from 'svelte';

	let {
		photo,
		isOwner,
		onClose,
		onDeleted,
	}: {
		photo: {
			_id: string;
			content: {
				storageId: string;
				imageUrl?: string | null;
				caption?: string;
				rotation: number;
			};
			creatorId: string;
		};
		isOwner: boolean;
		onClose: () => void;
		onDeleted: () => void;
	} = $props();

	const client = useConvexClient();

	let editCaption = $state(photo.content.caption ?? '');
	let saving = $state(false);
	let deleting = $state(false);
	let imageLoaded = $state(false);

	const isModified = $derived(editCaption !== (photo.content.caption ?? ''));

	// --- Theme ---
	const THEME = '#a78bfa';
	const THEME_RGB = '167, 139, 250';

	// --- Element refs ---
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let header: HTMLDivElement;
	let photoFrame: HTMLDivElement;
	let contentBlock: HTMLDivElement;
	let ambientOrb: HTMLDivElement;

	// --- Animation storage ---
	let entranceTl: gsap.core.Timeline | null = null;

	// Parallax state
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
	let photoQX: ReturnType<typeof gsap.quickTo> | null = null;
	let photoQY: ReturnType<typeof gsap.quickTo> | null = null;

	// --- Constants ---
	const SNAP_DURATION = 0.8;
	const SNAP_EASE = 'elastic.out(1, 0.4)';
	const BASE_SHADOW = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';

	// Passive parallax
	const SHIFT_PHOTO = 4;
	const SHIFT_CONTENT = 3;
	const SHIFT_ORB = 10;

	// Grab mode
	const PANEL_DRAG = 0.4;
	const PANEL_TILT = 0.035;
	const GRAB_PHOTO = 0.08;
	const GRAB_CONTENT = 0.1;
	const GRAB_ORB = 0.3;

	// --- Parallax ---

	function initParallax() {
		if (!header || !contentBlock || !ambientOrb || !photoFrame) return;
		headerQX = gsap.quickTo(header, 'x', { duration: 0.6, ease: 'power3.out' });
		headerQY = gsap.quickTo(header, 'y', { duration: 0.6, ease: 'power3.out' });
		contentQX = gsap.quickTo(contentBlock, 'x', { duration: 0.6, ease: 'power3.out' });
		contentQY = gsap.quickTo(contentBlock, 'y', { duration: 0.6, ease: 'power3.out' });
		orbQX = gsap.quickTo(ambientOrb, 'x', { duration: 0.6, ease: 'power3.out' });
		orbQY = gsap.quickTo(ambientOrb, 'y', { duration: 0.6, ease: 'power3.out' });
		photoQX = gsap.quickTo(photoFrame, 'x', { duration: 0.6, ease: 'power3.out' });
		photoQY = gsap.quickTo(photoFrame, 'y', { duration: 0.6, ease: 'power3.out' });
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
		headerQX = headerQY = contentQX = contentQY = orbQX = orbQY = photoQX = photoQY = null;

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
		if (photoFrame) gsap.to(photoFrame, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
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
					x: dx * PANEL_DRAG,
					y: dy * PANEL_DRAG,
					rotationY: dx * PANEL_TILT,
					rotationX: -dy * PANEL_TILT,
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
			photoQX?.(dx * GRAB_PHOTO);
			photoQY?.(dy * GRAB_PHOTO);
		} else {
			headerQX?.(nx * SHIFT_CONTENT);
			headerQY?.(ny * SHIFT_CONTENT);
			contentQX?.(nx * SHIFT_CONTENT);
			contentQY?.(ny * SHIFT_CONTENT);
			orbQX?.(nx * SHIFT_ORB);
			orbQY?.(ny * SHIFT_ORB);
			photoQX?.(nx * SHIFT_PHOTO);
			photoQY?.(ny * SHIFT_PHOTO);
		}
	}

	function handleMouseLeave() {
		if (grabbed) {
			grabbed = false;
			snapBack();
			return;
		}
		if (!parallaxActive) return;

		headerQX?.(0); headerQY?.(0);
		contentQX?.(0); contentQY?.(0);
		orbQX?.(0); orbQY?.(0);
		photoQX?.(0); photoQY?.(0);
	}

	// --- Actions ---

	async function save() {
		if (!isModified) return;
		saving = true;
		try {
			await client.mutation(api.photos.updateCaption, {
				id: photo._id as any,
				caption: editCaption,
			});
			onClose();
		} catch (err) {
			console.error('Failed to save caption:', err);
		} finally {
			saving = false;
		}
	}

	async function deletePhoto() {
		deleting = true;
		try {
			await client.mutation(api.objects.remove, {
				id: photo._id as any,
			});
			onDeleted();
		} catch (err) {
			console.error('Failed to delete photo:', err);
		} finally {
			deleting = false;
		}
	}

	// --- Close ---

	function handleClose() {
		parallaxActive = false;
		grabbed = false;

		const closeTl = gsap.timeline({
			onComplete: () => onClose(),
		});

		closeTl.to(panel, {
			scale: 0.95,
			opacity: 0,
			duration: 0.25,
			ease: 'power2.in',
		}, 0);

		closeTl.to(backdrop, {
			opacity: 0,
			duration: 0.2,
		}, 0.1);
	}

	// --- Lifecycle ---

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });

		const sections = contentBlock?.children ? Array.from(contentBlock.children) : [];

		entranceTl = gsap.timeline();

		// Panel scale + opacity
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0 },
			{ scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);

		// Photo frame slides up
		entranceTl.fromTo(photoFrame,
			{ y: 30, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
			0.12
		);

		// Header slides up
		entranceTl.fromTo(header,
			{ y: 12, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
			0.25
		);

		// Content sections cascade
		sections.forEach((section, i) => {
			entranceTl!.fromTo(section as HTMLElement,
				{ y: 10, opacity: 0 },
				{ y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
				0.32 + i * 0.06
			);
		});

		// Panel glow pulse on entrance
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 40px rgba(${THEME_RGB}, 0.3), inset 0 0 20px rgba(${THEME_RGB}, 0.06)`,
			duration: 0.4, ease: 'power2.in',
		}, 0.3);
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 8px rgba(${THEME_RGB}, 0.1), inset 0 0 8px rgba(${THEME_RGB}, 0.02)`,
			duration: 0.6, ease: 'power2.out',
		}, 0.7);

		entranceTl.call(() => {
			initParallax();
		}, [], '+=0');
	});

	onDestroy(() => {
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
		parallaxActive = false;
		grabbed = false;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={backdrop}
	class="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget && dragDistance < 5) handleClose(); }}
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	style:cursor={grabbed ? 'grabbing' : parallaxActive ? 'grab' : undefined}
	style:user-select={grabbed ? 'none' : undefined}
>
	<div bind:this={panel} class="glass-panel rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden max-h-[85vh] flex flex-col relative" style="will-change: transform, box-shadow;">

		<!-- Ambient orb -->
		<div bind:this={ambientOrb} class="ambient-orb"></div>

		<!-- Header (close button only) -->
		<div class="p-4 pb-0 flex-shrink-0 relative z-10">
			<div bind:this={header} class="flex justify-end">
				<button
					onclick={handleClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer flex-shrink-0"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Photo display -->
		<div class="px-6 relative z-10">
			<div
				bind:this={photoFrame}
				class="polaroid-frame"
				style="transform: rotate({photo.content.rotation * 0.3}deg);"
			>
				{#if photo.content.imageUrl}
					<img
						src={photo.content.imageUrl}
						alt={photo.content.caption || 'Photo'}
						class="polaroid-image"
						class:loaded={imageLoaded}
						onload={() => { imageLoaded = true; }}
						crossorigin="anonymous"
					/>
				{:else}
					<div class="polaroid-placeholder">
						<span class="text-white/30 text-3xl">&#x1F5BC;</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Content area -->
		<div bind:this={contentBlock} class="flex-1 overflow-y-auto px-6 pt-4 pb-6 relative z-10" style="display: flex; flex-direction: column; gap: 0.75rem;">

			<!-- Caption -->
			{#if isOwner}
				<div>
					<label class="text-xs font-medium uppercase tracking-wider mb-2 block caption-label" style="font-family: 'Geist Mono', monospace;">Caption</label>
					<textarea
						bind:value={editCaption}
						placeholder="Add a caption..."
						maxlength="500"
						rows="2"
						class="glass-input w-full rounded-lg px-3 py-2.5 text-sm resize-none"
						style="font-family: 'Geist Mono', monospace;"
					></textarea>
					<p class="text-xs text-white/30 mt-1 text-right" style="font-family: 'Geist Mono', monospace;">{editCaption.length}/500</p>
				</div>
			{:else if photo.content.caption}
				<p class="text-sm text-white/70" style="font-family: 'Geist Mono', monospace;">{photo.content.caption}</p>
			{/if}

			<!-- Actions -->
			{#if isOwner}
				<div class="flex gap-2 pt-1">
						<button
							onclick={save}
							disabled={saving || !isModified}
							class="lego-btn lego-violet flex-1 cursor-pointer"
							class:btn-dimmed={!isModified}
						>
							{saving ? 'Saving...' : 'Save Caption'}
						</button>
					<button
						onclick={deletePhoto}
						disabled={deleting}
						class="lego-btn lego-red cursor-pointer"
					>
						{deleting ? 'Deleting...' : 'Delete'}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.ambient-orb {
		position: absolute;
		top: 35%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 420px;
		height: 420px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(167, 139, 250, 0.12) 0%, rgba(167, 139, 250, 0.06) 25%, rgba(167, 139, 250, 0.02) 50%, transparent 70%);
		pointer-events: none;
		will-change: transform, opacity;
	}

	.caption-label {
		color: #a78bfa;
		text-shadow: 0 0 8px rgba(167, 139, 250, 0.3);
	}

	/* Polaroid frame — CSS version */
	.polaroid-frame {
		background: #ffffff;
		padding: 10px 10px 36px 10px;
		border-radius: 4px;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.25),
			0 1px 3px rgba(0, 0, 0, 0.1),
			inset 0 0 0 1px rgba(0, 0, 0, 0.04);
		will-change: transform;
		overflow: hidden;
	}

	.polaroid-image {
		width: 100%;
		max-height: 320px;
		object-fit: contain;
		border-radius: 2px;
		background: #f0f0f0;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.polaroid-image.loaded {
		opacity: 1;
	}

	.btn-dimmed {
		opacity: 0.35;
		cursor: default !important;
	}

	.polaroid-placeholder {
		width: 100%;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f0f0f0;
		border-radius: 2px;
	}
</style>
