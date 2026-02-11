<script lang="ts">
	import { signUp, signIn } from '$lib/auth';
	import { animate } from 'motion';
	import { onMount } from 'svelte';

	let mode: 'signin' | 'signup' = $state('signin');
	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let error = $state('');
	let isSubmitting = $state(false);
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
		animate(panel, { opacity: [0, 1], scale: [0.95, 1] }, { duration: 0.3 });
	});

	function toggleMode() {
		mode = mode === 'signin' ? 'signup' : 'signin';
		error = '';
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
				if (result.error) error = result.error;
			} else {
				const result = await signIn({ username, password });
				if (result.error) error = result.error;
			}
		} catch (err) {
			error = 'Something went wrong. Try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div bind:this={backdrop} class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
	<div bind:this={panel} class="w-full max-w-sm mx-4 rounded-2xl bg-white/95 shadow-2xl p-8">
		<h1 class="text-2xl font-bold text-center text-stone-800 mb-1">
			astrophage
		</h1>
		<p class="text-sm text-center text-stone-500 mb-6">
			{mode === 'signin' ? 'Welcome back' : 'Create your account'}
		</p>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4">
			{#if mode === 'signup'}
				<input
					type="text"
					bind:value={displayName}
					placeholder="Display name"
					class="px-4 py-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition"
				/>
			{/if}

			<input
				type="text"
				bind:value={username}
				placeholder="Username"
				required
				autocomplete="username"
				class="px-4 py-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition"
			/>

			<input
				type="password"
				bind:value={password}
				placeholder="Password"
				required
				minlength="10"
				autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
				class="px-4 py-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition"
			/>

			{#if error}
				<p class="text-sm text-red-500 text-center">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={isSubmitting}
				class="py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 transition cursor-pointer"
			>
				{#if isSubmitting}
					...
				{:else}
					{mode === 'signin' ? 'Sign In' : 'Sign Up'}
				{/if}
			</button>
		</form>

		<p class="text-sm text-center text-stone-500 mt-6">
			{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
			<button onclick={toggleMode} class="text-amber-600 font-medium hover:underline cursor-pointer">
				{mode === 'signin' ? 'Sign up' : 'Sign in'}
			</button>
		</p>
	</div>
</div>
