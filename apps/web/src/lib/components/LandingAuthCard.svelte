<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { signUp, signIn } from '$lib/auth';
	import type { CanvasRenderer } from '$lib/canvas/CanvasRenderer';

	let {
		renderer,
		onAuthSuccess,
	}: {
		renderer: CanvasRenderer;
		onAuthSuccess: () => void;
	} = $props();

	let mode: 'signin' | 'signup' = $state('signin');
	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let error = $state('');
	let isSubmitting = $state(false);

	// Screen position tracking — updated by ticker
	let screenX = $state(0);
	let screenY = $state(0);
	let screenWidth = $state(380);
	let screenHeight = $state(460);
	let scale = $state(1);
	let visible = $state(false);

	let tickerFn: (() => void) | null = null;

	onMount(() => {
		// Track the auth card position every frame
		tickerFn = () => {
			const authCard = renderer.authCardObject;
			if (!authCard) return;

			const pos = renderer.worldToScreen(authCard.container.x, authCard.container.y);
			const s = renderer.getScale();
			const bounds = authCard.getCardBounds();

			screenX = pos.x;
			screenY = pos.y;
			screenWidth = bounds.width * s;
			screenHeight = bounds.height * s;
			scale = s;
			visible = true;
		};
		renderer.app.ticker.add(tickerFn);
	});

	onDestroy(() => {
		if (tickerFn) {
			renderer.app.ticker.remove(tickerFn);
			tickerFn = null;
		}
	});

	function toggleMode() {
		const newMode = mode === 'signin' ? 'signup' : 'signin';
		mode = newMode;
		error = '';
		// Resize the PixiJS card to match
		renderer.authCardObject?.setMode(newMode);
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		isSubmitting = true;

		try {
			if (mode === 'signup') {
				const result = await signUp({
					username,
					password,
					displayName: displayName || username,
				});
				if (result.error) {
					error = result.error;
				} else {
					onAuthSuccess();
				}
			} else {
				const result = await signIn({ username, password });
				if (result.error) {
					error = result.error;
				} else {
					onAuthSuccess();
				}
			}
		} catch (err) {
			error = 'Something went wrong. Try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="landing-auth-overlay"
		style="
			left: {screenX}px;
			top: {screenY}px;
			width: {screenWidth}px;
			min-height: {screenHeight}px;
			transform: scale({Math.max(scale, 0.7)});
			transform-origin: top left;
		"
		onpointerdown={(e) => e.stopPropagation()}
		onpointermove={(e) => e.stopPropagation()}
	>
		<!-- Form content starts below the PixiJS brand text area -->
		<div class="auth-form-area">
			<form onsubmit={handleSubmit} class="flex flex-col gap-3">
				{#if mode === 'signup'}
					<input
						type="text"
						bind:value={displayName}
						placeholder="Display name"
						class="px-4 py-3 rounded-xl glass-input transition"
					/>
				{/if}

				<input
					type="text"
					bind:value={username}
					placeholder="Username"
					required
					autocomplete="username"
					class="px-4 py-3 rounded-xl glass-input transition"
				/>

				<input
					type="password"
					bind:value={password}
					placeholder="Password"
					required
					minlength="10"
					maxlength="64"
					autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
					class="px-4 py-3 rounded-xl glass-input transition"
				/>

				{#if error}
					<p class="text-sm text-red-400 text-center">{error}</p>
				{/if}

				<button
					type="submit"
					disabled={isSubmitting}
					class="lego-btn lego-btn-full lego-amber"
				>
					{#if isSubmitting}
						...
					{:else}
						{mode === 'signin' ? 'Sign In' : 'Sign Up'}
					{/if}
				</button>
			</form>

			<p class="text-sm text-center text-white/50 mt-4">
				{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
				<button onclick={toggleMode} class="text-amber-400 font-medium hover:underline cursor-pointer">
					{mode === 'signin' ? 'Sign up' : 'Sign in'}
				</button>
			</p>
		</div>
	</div>
{/if}

<style>
	.landing-auth-overlay {
		position: fixed;
		z-index: 45;
		pointer-events: auto;
		/* Leave the background transparent — PixiJS card provides the visual */
		padding: 0;
	}

	.auth-form-area {
		/* Offset below the brand text rendered by PixiJS */
		padding: 80px 28px 28px 28px;
	}
</style>
