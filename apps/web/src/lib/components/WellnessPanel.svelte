<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';
	import type { WellnessReport } from '../../convex/wellness';

	let {
		onClose,
	}: {
		onClose: () => void;
	} = $props();

	const client = useConvexClient();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let report = $state<WellnessReport | null>(null);

	// Element refs
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let contentSection: HTMLDivElement;

	// Animation storage
	let entranceTl: gsap.core.Timeline | null = null;

	// Health status display config
	const healthConfig: Record<string, { emoji: string; color: string; label: string; ring: string }> = {
		'thriving': { emoji: '\u{1F31F}', color: '#34d399', label: 'Thriving', ring: 'rgba(52, 211, 153, 0.15)' },
		'connected': { emoji: '\u{1F91D}', color: '#60a5fa', label: 'Connected', ring: 'rgba(96, 165, 250, 0.15)' },
		'growing': { emoji: '\u{1F331}', color: '#fbbf24', label: 'Growing', ring: 'rgba(251, 191, 36, 0.15)' },
		'needs-attention': { emoji: '\u{1F4AD}', color: '#f87171', label: 'Needs Love', ring: 'rgba(248, 113, 113, 0.15)' },
	};

	const friendStatusConfig: Record<string, { color: string; bg: string }> = {
		'thriving': { color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
		'connected': { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
		'drifting': { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
		'new': { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)' },
	};

	async function fetchReport() {
		loading = true;
		error = null;
		try {
			report = await client.action(api.wellness.generateReport, {}) as WellnessReport;
		} catch (err: any) {
			console.error('Wellness report failed:', err);
			error = err.message || 'Failed to generate report';
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		const closeTl = gsap.timeline({ onComplete: () => onClose() });
		closeTl.to(panel, { scale: 0.95, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0);
		closeTl.to(backdrop, { opacity: 0, duration: 0.2 }, 0.1);
	}

	onMount(() => {
		gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.3 });

		entranceTl = gsap.timeline();
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0, y: 20 },
			{ scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);

		fetchReport();
	});

	onDestroy(() => {
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
	});

	// Stagger-animate sections when report arrives
	$effect(() => {
		if (report && contentSection) {
			const sections = Array.from(contentSection.children);
			gsap.fromTo(sections,
				{ y: 12, opacity: 0 },
				{ y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', stagger: 0.08 }
			);
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={backdrop}
	class="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
>
	<div
		bind:this={panel}
		class="glass-panel rounded-t-2xl sm:rounded-2xl w-full max-w-2xl mx-0 sm:mx-4 overflow-hidden max-h-[90vh] flex flex-col relative"
		style="will-change: transform;"
	>
		<!-- Ambient pink glow -->
		<div class="wellness-orb"></div>

		<!-- Header -->
		<div class="p-6 pb-3 flex-shrink-0 relative z-10">
			<div class="flex items-start justify-between mb-2">
				<div class="flex items-center gap-3">
					<div class="wellness-icon-ring">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#f472b6"/>
						</svg>
					</div>
					<h2 class="text-lg font-bold text-white" style="font-family: 'Geist Mono', monospace;">Social Wellness</h2>
				</div>
				<button
					onclick={handleClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer flex-shrink-0 mt-1"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<p class="text-xs text-white/40" style="font-family: 'Geist Mono', monospace;">
				Powered by Claude Opus 4.6
			</p>
		</div>

		<!-- Content -->
		<div bind:this={contentSection} class="flex-1 overflow-y-auto px-6 pb-6 relative z-10 space-y-4">

			{#if loading}
				<div class="flex flex-col items-center py-12 gap-4">
					<div class="wellness-pulse-loader">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#f472b6" opacity="0.6"/>
						</svg>
					</div>
					<p class="text-sm text-white/50" style="font-family: 'Geist Mono', monospace;">
						Analyzing your social graph...
					</p>
					<p class="text-xs text-white/30" style="font-family: 'Geist Mono', monospace;">
						Claude is reading your friendships, beacons, and activity
					</p>
				</div>

			{:else if error}
				<div class="flex flex-col items-center py-12 gap-4">
					<p class="text-sm text-red-400/80" style="font-family: 'Geist Mono', monospace;">
						{error}
					</p>
					<button onclick={fetchReport} class="lego-btn lego-rose text-sm">
						Try again
					</button>
				</div>

			{:else if report}
				<!-- Health Badge -->
				<div class="flex items-center gap-4 p-4 rounded-xl" style="background: {healthConfig[report.overallHealth]?.ring ?? 'rgba(96,165,250,0.15)'};">
					<div class="health-score-ring" style="--ring-color: {healthConfig[report.overallHealth]?.color ?? '#60a5fa'};">
						<span class="text-2xl">{healthConfig[report.overallHealth]?.emoji ?? '\u{2728}'}</span>
						<span class="health-score-number" style="color: {healthConfig[report.overallHealth]?.color ?? '#60a5fa'};">{report.healthScore}</span>
					</div>
					<div class="flex-1">
						<p class="text-sm font-semibold" style="color: {healthConfig[report.overallHealth]?.color ?? '#60a5fa'}; font-family: 'Geist Mono', monospace;">
							{healthConfig[report.overallHealth]?.label ?? 'Unknown'}
						</p>
						<p class="text-sm text-white/70 mt-1" style="font-family: 'Geist Mono', monospace;">
							{report.summary}
						</p>
					</div>
				</div>

				<!-- Friend Insights -->
				{#if report.friendInsights.length > 0}
					<div>
						<h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-2" style="font-family: 'Geist Mono', monospace;">
							Friend Insights
						</h3>
						<div class="space-y-2">
							{#each report.friendInsights as friend}
								{@const cfg = friendStatusConfig[friend.status] ?? { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' }}
								<div class="friend-insight-card" style="border-left: 3px solid {cfg.color};">
									<div class="flex items-center gap-2 mb-1">
										<span class="text-base">{friend.emoji}</span>
										<span class="text-sm font-semibold text-white/90" style="font-family: 'Geist Mono', monospace;">{friend.name}</span>
										<span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style="background: {cfg.bg}; color: {cfg.color}; font-family: 'Geist Mono', monospace;">
											{friend.status}
										</span>
									</div>
									<p class="text-xs text-white/60 mb-1" style="font-family: 'Geist Mono', monospace;">{friend.insight}</p>
									<p class="text-xs text-white/40 italic" style="font-family: 'Geist Mono', monospace;">{friend.suggestion}</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Activity Suggestions -->
				{#if report.activitySuggestions.length > 0}
					<div>
						<h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-2" style="font-family: 'Geist Mono', monospace;">
							Hangout Ideas
						</h3>
						<div class="space-y-2">
							{#each report.activitySuggestions as activity}
								<div class="activity-card">
									<div class="flex items-center gap-2 mb-1">
										<span class="text-lg">{activity.emoji}</span>
										<span class="text-sm font-semibold text-white/90" style="font-family: 'Geist Mono', monospace;">{activity.title}</span>
									</div>
									<p class="text-xs text-white/60 mb-1.5" style="font-family: 'Geist Mono', monospace;">{activity.description}</p>
									<div class="flex gap-3 text-[10px] text-white/40" style="font-family: 'Geist Mono', monospace;">
										<span>{activity.bestFor}</span>
										<span>{activity.timing}</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Impact Connector -->
				<div>
					<h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-2" style="font-family: 'Geist Mono', monospace;">
						Impact Connector
					</h3>
					<div class="charity-card">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">{report.charityCause.emoji}</span>
							<span class="text-sm font-semibold text-emerald-300" style="font-family: 'Geist Mono', monospace;">{report.charityCause.cause}</span>
						</div>
						<p class="text-xs text-white/60 mb-2" style="font-family: 'Geist Mono', monospace;">{report.charityCause.whyItFits}</p>
						<div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
							<p class="text-xs text-emerald-300/80" style="font-family: 'Geist Mono', monospace;">{report.charityCause.firstStep}</p>
						</div>
					</div>
				</div>

				<!-- Weekly Nudge -->
				<div class="weekly-nudge">
					<div class="flex items-center gap-2 mb-2">
						<h3 class="text-xs font-medium text-amber-400/80 uppercase tracking-wider" style="font-family: 'Geist Mono', monospace;">
							This Week's Nudge
						</h3>
					</div>
					<p class="text-sm text-white/80" style="font-family: 'Geist Mono', monospace;">
						{report.weeklyNudge}
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.wellness-orb {
		position: absolute;
		top: 30%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 400px;
		height: 400px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(244, 114, 182, 0.10) 0%, rgba(244, 114, 182, 0.04) 30%, transparent 60%);
		pointer-events: none;
	}

	.wellness-icon-ring {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(244, 114, 182, 0.15);
		border: 1px solid rgba(244, 114, 182, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.wellness-pulse-loader {
		animation: wellnessPulse 1.5s ease-in-out infinite;
	}

	@keyframes wellnessPulse {
		0%, 100% { transform: scale(1); opacity: 0.6; }
		50% { transform: scale(1.15); opacity: 1; }
	}

	.health-score-ring {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: 3px solid var(--ring-color);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: rgba(0, 0, 0, 0.2);
		gap: 2px;
	}

	.health-score-number {
		font-size: 0.7rem;
		font-weight: 700;
		font-family: 'Geist Mono', monospace;
	}

	.friend-insight-card {
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
	}

	.activity-card {
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.charity-card {
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: rgba(16, 185, 129, 0.05);
		border: 1px solid rgba(16, 185, 129, 0.15);
	}

	.weekly-nudge {
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%);
		border: 1px solid rgba(251, 191, 36, 0.15);
	}
</style>
