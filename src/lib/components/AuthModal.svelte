<script lang="ts">
	import { signUp, signIn, signInWithPasskey, resetWithRecoveryCode } from '$lib/auth';
	import { animate } from 'motion';
	import { onMount } from 'svelte';

	let mode: 'signin' | 'signup' | 'recovery' = $state('signin');
	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let error = $state('');
	let isSubmitting = $state(false);
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;

	// Recovery form fields
	let recoveryCode = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// Passkey support detection
	let supportsPasskeys = $state(false);

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
		animate(panel, { opacity: [0, 1], scale: [0.95, 1] }, { duration: 0.3 });
		supportsPasskeys = typeof window !== 'undefined' && !!window.PublicKeyCredential;
	});

	function toggleMode() {
		mode = mode === 'signin' ? 'signup' : 'signin';
		error = '';
	}

	async function handlePasskeySignIn() {
		error = '';
		isSubmitting = true;
		try {
			const result = await signInWithPasskey();
			if (result.error) error = result.error;
		} catch {
			error = 'Passkey sign-in failed.';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleRecovery(e: Event) {
		e.preventDefault();
		error = '';
		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}
		isSubmitting = true;
		try {
			const result = await resetWithRecoveryCode(username, recoveryCode, newPassword);
			if (result.error) {
				error = result.error;
			} else {
				// Auto-sign in with new credentials
				const signInResult = await signIn({ username, password: newPassword });
				if (signInResult.error) {
					error = 'Password reset, but sign-in failed. Try signing in manually.';
					mode = 'signin';
				}
			}
		} catch {
			error = 'Recovery failed.';
		} finally {
			isSubmitting = false;
		}
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

<div bind:this={backdrop} class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop">
	<div bind:this={panel} class="w-full max-w-sm mx-4 rounded-2xl glass-panel p-8">
		<h1 class="text-2xl font-bold text-center text-white mb-1">
			orbyt
		</h1>
		<p class="text-sm text-center text-white/50 mb-6">
			{#if mode === 'recovery'}
				Reset your password
			{:else}
				{mode === 'signin' ? 'Welcome back' : 'Create your account'}
			{/if}
		</p>

		{#if mode === 'recovery'}
			<form onsubmit={handleRecovery} class="flex flex-col gap-4">
				<input
					type="text"
					bind:value={username}
					placeholder="Username"
					required
					autocomplete="username"
					class="px-4 py-3 rounded-xl glass-input transition"
				/>
				<input
					type="text"
					bind:value={recoveryCode}
					placeholder="Recovery code"
					required
					class="px-4 py-3 rounded-xl glass-input transition font-mono tracking-wider"
				/>
				<input
					type="password"
					bind:value={newPassword}
					placeholder="New password"
					required
					minlength="10"
					maxlength="64"
					autocomplete="new-password"
					class="px-4 py-3 rounded-xl glass-input transition"
				/>
				<input
					type="password"
					bind:value={confirmPassword}
					placeholder="Confirm new password"
					required
					minlength="10"
					maxlength="64"
					autocomplete="new-password"
					class="px-4 py-3 rounded-xl glass-input transition"
				/>

				{#if error}
					<p class="text-sm text-red-400 text-center">{error}</p>
				{/if}

				<button type="submit" disabled={isSubmitting} class="lego-btn lego-btn-full lego-amber">
					{isSubmitting ? '...' : 'Reset Password'}
				</button>
			</form>
			<p class="text-sm text-center text-white/50 mt-4">
				<button onclick={() => { mode = 'signin'; error = ''; }} class="text-amber-400 font-medium hover:underline cursor-pointer">
					Back to sign in
				</button>
			</p>
		{:else}
			<form onsubmit={handleSubmit} class="flex flex-col gap-4">
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

			{#if mode === 'signin' && supportsPasskeys}
				<div class="flex items-center gap-3 my-4">
					<div class="flex-1 h-px bg-white/10"></div>
					<span class="text-xs text-white/30">or</span>
					<div class="flex-1 h-px bg-white/10"></div>
				</div>
				<button
					onclick={handlePasskeySignIn}
					disabled={isSubmitting}
					class="w-full px-4 py-3 rounded-xl text-sm font-medium bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] transition cursor-pointer disabled:opacity-50"
				>
					Sign in with Passkey
				</button>
			{/if}

			<p class="text-sm text-center text-white/50 mt-6">
				{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
				<button onclick={toggleMode} class="text-amber-400 font-medium hover:underline cursor-pointer">
					{mode === 'signin' ? 'Sign up' : 'Sign in'}
				</button>
			</p>

			{#if mode === 'signin'}
				<p class="text-xs text-center text-white/30 mt-2">
					<button onclick={() => { mode = 'recovery'; error = ''; }} class="text-white/40 hover:text-white/60 hover:underline cursor-pointer">
						Forgot password?
					</button>
				</p>
			{/if}
		{/if}
	</div>
</div>
