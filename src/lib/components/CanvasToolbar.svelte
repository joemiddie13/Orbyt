<script lang="ts">
	import { signOut } from '$lib/auth';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		username,
		canvasName,
		isOwner = true,
		onAddNote,
		onCreateBeacon,
		onAddPhoto,
		onAddMusic,
		onFriends,
		onFriendsList,
		onCanvasSwitcher,
		webrtcConnected = false,
	}: {
		username: string;
		canvasName?: string;
		isOwner?: boolean;
		onAddNote: () => void;
		onCreateBeacon: () => void;
		onAddPhoto: () => void;
		onAddMusic: () => void;
		onFriends: () => void;
		onFriendsList: () => void;
		onCanvasSwitcher: () => void;
		webrtcConnected?: boolean;
	} = $props();

	let isSigningOut = $state(false);

	// SVG element refs for GSAP animations
	let noteSparkle: SVGElement = $state(undefined!);
	let notePencil: SVGElement = $state(undefined!);
	let beaconWave1: SVGElement = $state(undefined!);
	let beaconWave2: SVGElement = $state(undefined!);
	let photoFlash: SVGElement = $state(undefined!);
	let photoLens: SVGElement = $state(undefined!);
	let musicNote: SVGElement = $state(undefined!);
	let musicWave1: SVGElement = $state(undefined!);
	let musicWave2: SVGElement = $state(undefined!);

	// Store tweens for cleanup
	let idleTweens: gsap.core.Tween[] = [];

	onMount(() => {
		// Note sparkle idle — opacity breathe
		if (noteSparkle) {
			idleTweens.push(
				gsap.to(noteSparkle, {
					opacity: 1,
					duration: 2,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Beacon outer arc idle — opacity pulse
		if (beaconWave2) {
			idleTweens.push(
				gsap.to(beaconWave2, {
					opacity: 0.8,
					duration: 1.8,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Photo lens highlight idle — subtle gleam
		if (photoLens) {
			idleTweens.push(
				gsap.to(photoLens, {
					opacity: 0.7,
					duration: 2.5,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Music wave idle — opacity pulse
		if (musicWave2) {
			idleTweens.push(
				gsap.to(musicWave2, {
					opacity: 0.8,
					duration: 2,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}
	});

	onDestroy(() => {
		idleTweens.forEach((t) => t.kill());
		idleTweens = [];
	});

	function noteEnter() {
		if (!notePencil || !noteSparkle) return;
		const tl = gsap.timeline();
		tl.to(notePencil, { rotation: -12, transformOrigin: '50% 100%', duration: 0.15, ease: 'power2.out' });
		tl.to(notePencil, { rotation: 0, duration: 0.15, ease: 'power2.out' });
		tl.to(noteSparkle, { scale: 1.5, opacity: 1, transformOrigin: '50% 50%', duration: 0.15, ease: 'power2.out' }, 0);
		tl.to(noteSparkle, { scale: 1, duration: 0.15, ease: 'power2.out' }, 0.15);
	}

	function beaconEnter() {
		if (!beaconWave1 || !beaconWave2) return;
		const tl = gsap.timeline();
		tl.fromTo(beaconWave1, { scale: 0.85, opacity: 0.9, transformOrigin: '50% 100%' }, { scale: 1.1, opacity: 0.3, duration: 0.4, ease: 'power2.out' });
		tl.fromTo(beaconWave2, { scale: 0.85, opacity: 0.9, transformOrigin: '50% 100%' }, { scale: 1.1, opacity: 0.3, duration: 0.4, ease: 'power2.out' }, 0.1);
	}

	function photoEnter() {
		if (!photoFlash || !photoLens) return;
		const tl = gsap.timeline();
		tl.fromTo(photoFlash, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1.3, opacity: 1, duration: 0.18, ease: 'back.out(1.4)' });
		tl.to(photoFlash, { scale: 1, opacity: 0.7, duration: 0.17, ease: 'power2.out' });
		tl.fromTo(photoLens, { scale: 1, transformOrigin: '50% 50%' }, { scale: 1.15, duration: 0.15, ease: 'power2.out' }, 0);
		tl.to(photoLens, { scale: 1, duration: 0.2, ease: 'back.out(1.4)' }, 0.15);
	}

	function musicEnter() {
		if (!musicNote || !musicWave1 || !musicWave2) return;
		const tl = gsap.timeline();
		tl.to(musicNote, { rotation: -15, transformOrigin: '50% 100%', duration: 0.12, ease: 'power2.out' });
		tl.to(musicNote, { rotation: 15, duration: 0.12, ease: 'power2.out' });
		tl.to(musicNote, { rotation: 0, duration: 0.12, ease: 'power2.out' });
		tl.fromTo(musicWave1, { scale: 0.8, opacity: 0.3, transformOrigin: '50% 50%' }, { scale: 1.2, opacity: 0.9, duration: 0.25, ease: 'power2.out' }, 0);
		tl.fromTo(musicWave2, { scale: 0.8, opacity: 0.2, transformOrigin: '50% 50%' }, { scale: 1.2, opacity: 0.7, duration: 0.25, ease: 'power2.out' }, 0.08);
	}

	async function handleSignOut() {
		isSigningOut = true;
		await signOut();
	}
</script>

<div class="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[rgba(15,14,26,0.75)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/[0.08]">
	<span class="text-sm font-medium text-white/80 flex items-center gap-1.5">
		{username}
		{#if webrtcConnected}
			<span
				class="w-2 h-2 rounded-full bg-emerald-400"
				title="Real-time connected"
			></span>
		{/if}
	</span>

	<div class="w-px h-5 bg-white/10"></div>

	<!-- Canvas name / switcher -->
	<button
		onclick={onCanvasSwitcher}
		class="px-2 py-1 rounded-lg text-sm text-white/60 hover:bg-white/10 transition cursor-pointer flex items-center gap-1"
	>
		{canvasName ?? 'My Canvas'}
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<div class="w-px h-5 bg-white/10"></div>

	{#if isOwner}
		<!-- Note button — pencil + sparkle -->
		<button
			onclick={onAddNote}
			onmouseenter={noteEnter}
			class="lego-btn lego-amber flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Pencil body -->
				<g bind:this={notePencil}>
					<rect x="4" y="3" width="4" height="12" rx="1" transform="rotate(-5 6 9)" fill="white" opacity="0.95"/>
					<polygon points="4.5,14.5 5,17 7.5,16.5" fill="white" opacity="0.95"/>
					<rect x="4.2" y="3" width="4" height="2.5" rx="0.5" transform="rotate(-5 6.2 4.25)" fill="white" opacity="0.6"/>
				</g>
				<!-- Sparkle at writing tip -->
				<path bind:this={noteSparkle}
					d="M12 4 L13 6 L15 7 L13 8 L12 10 L11 8 L9 7 L11 6 Z"
					fill="white" opacity="0.5"
				/>
			</svg>
			Note
		</button>

		<!-- Beacon button — signal broadcast -->
		<button
			onclick={onCreateBeacon}
			onmouseenter={beaconEnter}
			class="lego-btn lego-orange flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Center dot -->
				<circle cx="10" cy="14" r="2" fill="white" opacity="0.95"/>
				<!-- Inner arc wave -->
				<path bind:this={beaconWave1}
					d="M6.5 10 A5 5 0 0 1 13.5 10"
					stroke="white" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.7"
				/>
				<!-- Outer arc wave -->
				<path bind:this={beaconWave2}
					d="M4 7 A8 8 0 0 1 16 7"
					stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"
				/>
			</svg>
			Beacon
		</button>

		<!-- Photo button — camera + flash -->
		<button
			onclick={onAddPhoto}
			onmouseenter={photoEnter}
			class="lego-btn lego-violet flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Camera body -->
				<rect x="2" y="8" width="16" height="10" rx="2" fill="white" opacity="0.95"/>
				<!-- Viewfinder bump -->
				<rect x="7" y="5.5" width="6" height="3.5" rx="1" fill="white" opacity="0.95"/>
				<!-- Lens circle -->
				<circle cx="10" cy="13" r="3" fill="none" stroke="rgba(139,92,246,0.8)" stroke-width="1.5"/>
				<!-- Lens highlight -->
				<circle bind:this={photoLens}
					cx="9" cy="12" r="1" fill="white" opacity="0.3"
				/>
				<!-- Flash burst (4-point star) -->
				<path bind:this={photoFlash}
					d="M16 3 L16.5 4.5 L18 5 L16.5 5.5 L16 7 L15.5 5.5 L14 5 L15.5 4.5 Z"
					fill="white" opacity="0.7"
				/>
			</svg>
			Photo
		</button>

		<!-- Music button — note + sound waves -->
		<button
			onclick={onAddMusic}
			onmouseenter={musicEnter}
			class="lego-btn lego-teal flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Music note -->
				<g bind:this={musicNote}>
					<circle cx="7" cy="15" r="2.5" fill="white" opacity="0.95"/>
					<rect x="9" y="4" width="2" height="11" rx="0.5" fill="white" opacity="0.95"/>
					<path d="M9.5 4 L16 2 L16 6 L11 8" fill="white" opacity="0.8"/>
				</g>
				<!-- Sound wave arcs -->
				<path bind:this={musicWave1}
					d="M14 9 A3 3 0 0 1 14 15"
					stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"
				/>
				<path bind:this={musicWave2}
					d="M16 7 A6 6 0 0 1 16 17"
					stroke="white" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.3"
				/>
			</svg>
			Music
		</button>
	{/if}

	<div class="w-px h-5 bg-white/10"></div>

	<!-- Friends buttons -->
	<button
		onclick={onFriends}
		title="Friend Code"
		class="px-2 py-1.5 rounded-xl text-white/60 hover:bg-white/10 active:bg-white/15 transition cursor-pointer"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
		</svg>
	</button>

	<button
		onclick={onFriendsList}
		title="Your Friends"
		class="px-2 py-1.5 rounded-xl text-white/60 hover:bg-white/10 active:bg-white/15 transition cursor-pointer"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
	</button>

	<button
		onclick={handleSignOut}
		disabled={isSigningOut}
		class="lego-btn lego-btn-sm lego-neutral"
	>
		Sign out
	</button>
</div>
