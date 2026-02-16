<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { animate } from 'motion';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		beacon,
		userUuid,
		onClose,
		onNavigateToUser,
	}: {
		beacon: {
			_id: string;
			content: {
				title: string;
				description?: string;
				locationAddress?: string;
				startTime: number;
				endTime: number;
				visibilityType: string;
			};
			creatorId: string;
		};
		userUuid: string;
		onClose: () => void;
		onNavigateToUser?: (userId: string, displayName: string) => void;
	} = $props();

	const client = useConvexClient();
	const responses = useQuery(
		api.responses.getByBeacon,
		() => ({ beaconId: beacon._id as any })
	);

	let responding = $state(false);

	async function respond(status: 'joining' | 'interested' | 'declined') {
		responding = true;
		try {
			await client.mutation(api.responses.respond, {
				beaconId: beacon._id as any,
				status,
			});
		} catch (err) {
			console.error('Failed to respond:', err);
		} finally {
			responding = false;
		}
	}

	async function removeResponse() {
		responding = true;
		try {
			await client.mutation(api.responses.removeResponse, {
				beaconId: beacon._id as any,
			});
		} catch (err) {
			console.error('Failed to remove response:', err);
		} finally {
			responding = false;
		}
	}

	const myResponse = $derived(
		responses.data?.find((r: any) => r.userId === userUuid)
	);

	const joining = $derived(
		responses.data?.filter((r: any) => r.status === 'joining') ?? []
	);
	const interested = $derived(
		responses.data?.filter((r: any) => r.status === 'interested') ?? []
	);

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function formatDate(ts: number): string {
		const d = new Date(ts);
		const now = new Date();
		if (d.toDateString() === now.toDateString()) return 'Today';
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	// --- Theme color from beacon data (fixed, not toggleable) ---
	const isDirect = beacon.content.visibilityType === 'direct';
	const themeColor = isDirect ? '#26A69A' : '#FFA726';
	const themeRgb = isDirect ? '38, 166, 154' : '255, 167, 38';

	// --- Element refs ---
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let header: HTMLDivElement;
	let contentBlock: HTMLDivElement;
	let ambientOrb: HTMLDivElement;
	let signalSvg: SVGSVGElement;

	// SVG ring refs
	let ring1: SVGCircleElement;
	let ring2: SVGCircleElement;
	let ring3: SVGCircleElement;
	let ring4: SVGCircleElement;
	let centerDot: SVGCircleElement;

	// --- Animation storage ---
	let entranceTl: gsap.core.Timeline | null = null;
	let pulseTl: gsap.core.Timeline | null = null;

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

	// Ripple state
	let rippleInterval: ReturnType<typeof setInterval> | null = null;
	let rippleTweens: gsap.core.Tween[] = [];
	let rippleElements: SVGCircleElement[] = [];

	// Idle phase gate
	let idleActive = false;

	// --- Constants ---
	const ORANGE = '#FFA726';
	const TEAL = '#26A69A';
	const CX = 200;
	const CY = 252;

	// Passive parallax shift amounts
	const SHIFT_DOT = 1.5;
	const SHIFT_CONTENT = 3;
	const SHIFT_INNER = 8;
	const SHIFT_ORB = 10;
	const SHIFT_OUTER = 16;

	// Grab mode
	const PANEL_DRAG = 0.4;
	const PANEL_TILT = 0.035;
	const GRAB_CONTENT = 0.1;
	const GRAB_INNER = 0.2;
	const GRAB_ORB = 0.3;
	const GRAB_OUTER = 0.45;
	const GRAB_DOT = 0.05;

	// Snap-back
	const SNAP_DURATION = 0.8;
	const SNAP_EASE = 'elastic.out(1, 0.4)';

	const BASE_SHADOW = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';

	// --- Parallax ---

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
		if (target.closest('button')) return;
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

		[ring1, ring2, ring3, ring4, centerDot].forEach(el => {
			if (el) gsap.to(el, {
				attr: { cx: CX, cy: CY },
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		});

		rippleElements.forEach(circle => {
			gsap.to(circle, {
				attr: { cx: CX, cy: CY },
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		});
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

			if (centerDot) {
				gsap.to(centerDot, {
					attr: { cx: CX - dx * GRAB_DOT, cy: CY - dy * GRAB_DOT },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			}

			[ring1, ring2].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + dx * GRAB_INNER, cy: CY + dy * GRAB_INNER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});

			[ring3, ring4].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + dx * GRAB_OUTER, cy: CY + dy * GRAB_OUTER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});

			rippleElements.forEach(circle => {
				gsap.to(circle, {
					attr: { cx: CX + dx * GRAB_OUTER, cy: CY + dy * GRAB_OUTER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});
		} else {
			headerQX?.(nx * SHIFT_CONTENT);
			headerQY?.(ny * SHIFT_CONTENT);
			contentQX?.(nx * SHIFT_CONTENT);
			contentQY?.(ny * SHIFT_CONTENT);
			orbQX?.(nx * SHIFT_ORB);
			orbQY?.(ny * SHIFT_ORB);

			if (centerDot) {
				gsap.to(centerDot, {
					attr: { cx: CX - nx * SHIFT_DOT, cy: CY - ny * SHIFT_DOT },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			}

			[ring1, ring2].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + nx * SHIFT_INNER, cy: CY + ny * SHIFT_INNER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});

			[ring3, ring4].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + nx * SHIFT_OUTER, cy: CY + ny * SHIFT_OUTER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});

			rippleElements.forEach(circle => {
				gsap.to(circle, {
					attr: { cx: CX + nx * SHIFT_OUTER, cy: CY + ny * SHIFT_OUTER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});
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

		[ring1, ring2, ring3, ring4, centerDot].forEach(el => {
			if (el) gsap.to(el, {
				attr: { cx: CX, cy: CY },
				duration: 0.6, ease: 'power3.out', overwrite: 'auto',
			});
		});

		rippleElements.forEach(circle => {
			gsap.to(circle, {
				attr: { cx: CX, cy: CY },
				duration: 0.6, ease: 'power3.out', overwrite: 'auto',
			});
		});
	}

	// --- Ripple Emanation ---

	function spawnRipple() {
		if (!signalSvg) return;
		if (rippleElements.length >= 2) return;

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
		circle.setAttribute('cx', String(CX));
		circle.setAttribute('cy', String(CY));
		circle.setAttribute('r', '0');
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', themeColor);
		circle.setAttribute('stroke-width', '0.8');
		circle.setAttribute('opacity', '0.12');

		signalSvg.insertBefore(circle, signalSvg.firstChild);
		rippleElements.push(circle);

		const tween = gsap.to(circle, {
			attr: { r: 280 },
			opacity: 0,
			duration: 3,
			ease: 'power1.out',
			onComplete: () => {
				circle.remove();
				rippleElements = rippleElements.filter(el => el !== circle);
				rippleTweens = rippleTweens.filter(t => t !== tween);
			},
		});
		rippleTweens.push(tween);
	}

	function startRipples() {
		spawnRipple();
		rippleInterval = setInterval(() => spawnRipple(), 2500);
	}

	function stopRipples() {
		if (rippleInterval) {
			clearInterval(rippleInterval);
			rippleInterval = null;
		}
		rippleTweens.forEach(t => t.kill());
		rippleTweens = [];
		rippleElements.forEach(el => el.remove());
		rippleElements = [];
	}

	// --- Unified Radiating Pulse ---

	function createPulseTimeline() {
		if (pulseTl) { pulseTl.kill(); pulseTl = null; }
		if (!centerDot) return;

		pulseTl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });

		// Center dot heartbeat
		pulseTl.to(centerDot, {
			attr: { r: 10 }, opacity: 0.85,
			duration: 0.3, ease: 'power2.in',
		}, 0);
		pulseTl.to(centerDot, {
			attr: { r: 6 }, opacity: 0.4,
			duration: 0.5, ease: 'power2.out',
		}, 0.3);

		// Rings: staggered outward wave
		const ringConfigs = [
			{ el: ring1, baseR: 40, baseOp: 0.15, peakR: 48, peakOp: 0.28 },
			{ el: ring2, baseR: 80, baseOp: 0.10, peakR: 88, peakOp: 0.22 },
			{ el: ring3, baseR: 130, baseOp: 0.06, peakR: 138, peakOp: 0.16 },
			{ el: ring4, baseR: 190, baseOp: 0.03, peakR: 198, peakOp: 0.12 },
		];

		ringConfigs.forEach(({ el, baseR, baseOp, peakR, peakOp }, i) => {
			if (!el) return;
			const delay = 0.1 * (i + 1);
			pulseTl!.to(el, {
				attr: { r: peakR }, opacity: peakOp,
				duration: 0.3, ease: 'power2.in',
			}, delay);
			pulseTl!.to(el, {
				attr: { r: baseR }, opacity: baseOp,
				duration: 0.5, ease: 'power2.out',
			}, delay + 0.3);
		});

		// Orb brightens
		if (ambientOrb) {
			pulseTl.to(ambientOrb, {
				opacity: 1.0, duration: 0.35, ease: 'power2.in',
			}, 0.15);
			pulseTl.to(ambientOrb, {
				opacity: 0.7, duration: 0.5, ease: 'power2.out',
			}, 0.5);
		}

		// Panel glow
		if (panel) {
			pulseTl.to(panel, {
				boxShadow: `${BASE_SHADOW}, 0 0 30px rgba(${themeRgb}, 0.4), inset 0 0 25px rgba(${themeRgb}, 0.08)`,
				duration: 0.3, ease: 'power2.in',
			}, 0.45);
			pulseTl.to(panel, {
				boxShadow: `${BASE_SHADOW}, 0 0 8px rgba(${themeRgb}, 0.1), inset 0 0 8px rgba(${themeRgb}, 0.02)`,
				duration: 0.5, ease: 'power2.out',
			}, 0.75);
		}

		// Panel scale bump
		if (panel) {
			pulseTl.to(panel, {
				scale: 1.006, duration: 0.25, ease: 'power2.in',
			}, 0.45);
			pulseTl.to(panel, {
				scale: 1, duration: 0.45, ease: 'power2.out',
			}, 0.7);
		}
	}

	function killPulse() {
		if (pulseTl) { pulseTl.kill(); pulseTl = null; }
	}

	// --- Close ---

	function handleClose() {
		stopRipples();
		killPulse();
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
		// Backdrop fade
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });

		// Entrance timeline
		const rings = [ring1, ring2, ring3, ring4].filter(Boolean);
		const sections = contentBlock?.children ? Array.from(contentBlock.children) : [];

		entranceTl = gsap.timeline();

		// Panel scale + opacity
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0 },
			{ scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);

		// Center dot pops in
		entranceTl.fromTo(centerDot,
			{ attr: { r: 0 }, opacity: 0 },
			{ attr: { r: 6 }, opacity: 0.4, duration: 0.3, ease: 'back.out(2)' },
			0.1
		);

		// Rings expand outward
		rings.forEach((ring, i) => {
			const targetR = [40, 80, 130, 190][i];
			entranceTl!.fromTo(ring,
				{ attr: { r: 0 }, opacity: 0 },
				{
					attr: { r: targetR },
					opacity: [0.15, 0.10, 0.06, 0.03][i],
					duration: 0.4,
					ease: 'power2.out'
				},
				0.15 + i * 0.08
			);
		});

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

		// Start idle systems
		entranceTl.call(() => {
			idleActive = true;
			createPulseTimeline();
			startRipples();
			initParallax();
		}, [], '+=0');
	});

	onDestroy(() => {
		killPulse();
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
		stopRipples();
		parallaxActive = false;
		grabbed = false;
		idleActive = false;
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
		<div bind:this={ambientOrb} class="ambient-orb" class:direct={isDirect}></div>

		<!-- SVG Signal Ring Layer -->
		<svg
			bind:this={signalSvg}
			class="absolute inset-0 w-full h-full pointer-events-none"
			viewBox="0 0 400 600"
			preserveAspectRatio="xMidYMid meet"
			aria-hidden="true"
		>
			<circle bind:this={ring1} cx={CX} cy={CY} r="40" fill="none" stroke={themeColor} stroke-width="1.8" opacity="0.15" />
			<circle bind:this={ring2} cx={CX} cy={CY} r="80" fill="none" stroke={themeColor} stroke-width="1.5" opacity="0.10" />
			<circle bind:this={ring3} cx={CX} cy={CY} r="130" fill="none" stroke={themeColor} stroke-width="1.2" opacity="0.06" />
			<circle bind:this={ring4} cx={CX} cy={CY} r="190" fill="none" stroke={themeColor} stroke-width="1.0" opacity="0.03" />
			<circle bind:this={centerDot} cx={CX} cy={CY} r="6" fill={themeColor} opacity="0.4" />
		</svg>

		<!-- Header -->
		<div class="p-6 pb-3 flex-shrink-0 relative z-10">
			<div bind:this={header}>
				<div class="flex items-start justify-between mb-3">
					<h2 class="text-xl font-bold text-white flex-1 pr-4" style="font-family: 'Geist Mono', monospace;">{beacon.content.title}</h2>
					<button
						onclick={handleClose}
						class="text-white/40 hover:text-white/70 transition cursor-pointer flex-shrink-0"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div class="space-y-1.5">
					<p class="beacon-time-label" class:direct={isDirect}>
						{formatDate(beacon.content.startTime)} &middot; {formatTime(beacon.content.startTime)} &ndash; {formatTime(beacon.content.endTime)}
					</p>
					{#if beacon.content.locationAddress}
						<p class="text-sm text-white/60" style="font-family: 'Geist Mono', monospace;">
							<span class="inline-block mr-1">&#x1F4CD;</span>{beacon.content.locationAddress}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Content area -->
		<div bind:this={contentBlock} class="flex-1 overflow-y-auto px-6 pb-6 relative z-10" style="display: flex; flex-direction: column; gap: 0.75rem;">

			<!-- Description -->
			{#if beacon.content.description}
				<p class="text-sm text-white/70" style="font-family: 'Geist Mono', monospace;">{beacon.content.description}</p>
			{/if}

			<!-- Response buttons -->
			<div class="flex gap-2">
				<button
					onclick={() => myResponse?.status === 'joining' ? removeResponse() : respond('joining')}
					disabled={responding}
					class="lego-btn lego-emerald flex-1 cursor-pointer {myResponse?.status === 'joining' ? 'active' : ''}"
				>
					{myResponse?.status === 'joining' ? "I'm in! \u2713" : "I'm in"}
				</button>
				<button
					onclick={() => myResponse?.status === 'interested' ? removeResponse() : respond('interested')}
					disabled={responding}
					class="lego-btn lego-amber flex-1 cursor-pointer {myResponse?.status === 'interested' ? 'active' : ''}"
				>
					{myResponse?.status === 'interested' ? 'Interested \u2713' : 'Interested'}
				</button>
				<button
					onclick={() => myResponse?.status === 'declined' ? removeResponse() : respond('declined')}
					disabled={responding}
					class="lego-btn lego-neutral flex-1 cursor-pointer {myResponse?.status === 'declined' ? 'active' : ''}"
				>
					{myResponse?.status === 'declined' ? "Can't \u2713" : "Can't make it"}
				</button>
			</div>

			<!-- Attendee lists -->
			{#if joining.length > 0}
				<div>
					<p class="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1.5" style="font-family: 'Geist Mono', monospace;">Going</p>
					<div class="flex flex-wrap gap-1.5">
						{#each joining as person (person.userId)}
							<button
								class="lego-chip lego-chip-emerald cursor-pointer"
								onclick={() => onNavigateToUser?.(person.userId, person.displayName)}
							>{person.displayName}</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if interested.length > 0}
				<div>
					<p class="text-xs font-medium text-amber-400 uppercase tracking-wider mb-1.5" style="font-family: 'Geist Mono', monospace;">Interested</p>
					<div class="flex flex-wrap gap-1.5">
						{#each interested as person (person.userId)}
							<button
								class="lego-chip lego-chip-amber cursor-pointer"
								onclick={() => onNavigateToUser?.(person.userId, person.displayName)}
							>{person.displayName}</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if !responses.data || responses.data.length === 0}
				<p class="text-sm text-white/40 text-center py-4" style="font-family: 'Geist Mono', monospace;">No responses yet &mdash; be the first!</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.ambient-orb {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 500px;
		height: 500px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 167, 38, 0.12) 0%, rgba(255, 167, 38, 0.06) 25%, rgba(255, 167, 38, 0.02) 50%, transparent 70%);
		pointer-events: none;
		will-change: transform, opacity;
	}

	.ambient-orb.direct {
		background: radial-gradient(circle, rgba(38, 166, 154, 0.12) 0%, rgba(38, 166, 154, 0.06) 25%, rgba(38, 166, 154, 0.02) 50%, transparent 70%);
	}

	.beacon-time-label {
		font-size: 0.8rem;
		color: #FFA726;
		text-shadow: 0 0 8px rgba(255, 167, 38, 0.3);
		font-family: 'Geist Mono', monospace;
		letter-spacing: 0.02em;
	}

	.beacon-time-label.direct {
		color: #26A69A;
		text-shadow: 0 0 8px rgba(38, 166, 154, 0.3);
	}

</style>
