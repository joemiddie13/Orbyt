<script lang="ts">
	import { signUp, signIn, signInWithPasskey, resetWithRecoveryCode } from '$lib/auth';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		initialMode = 'signin' as 'signin' | 'signup',
		onAuthSuccess,
	}: {
		initialMode?: 'signin' | 'signup';
		onAuthSuccess?: () => void;
	} = $props();

	let open = $state(false);
	let popover = $state<HTMLDivElement>(undefined!);
	let trigger = $state<HTMLButtonElement>(undefined!);

	let mode: 'signin' | 'signup' | 'recovery' = $state(initialMode);
	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let error = $state('');
	let isSubmitting = $state(false);

	// Recovery form fields
	let recoveryCode = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	let supportsPasskeys = $state(false);

	// Sync mode from prop when dropdown is reopened
	$effect(() => {
		mode = initialMode;
	});

	function toggle() {
		if (open) {
			close();
		} else {
			error = '';
			open = true;
			requestAnimationFrame(() => {
				if (!popover) return;
				gsap.fromTo(popover,
					{ scale: 0.6, opacity: 0, transformOrigin: 'top center' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
			});
		}
	}

	function close() {
		if (!open || !popover) { open = false; return; }
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'top center',
			onComplete: () => { open = false; },
		});
	}

	function switchMode(newMode: 'signin' | 'signup' | 'recovery') {
		mode = newMode;
		error = '';
	}

	async function handlePasskeySignIn() {
		error = '';
		isSubmitting = true;
		try {
			const result = await signInWithPasskey();
			if (result.error) {
				error = result.error;
			} else {
				close();
				onAuthSuccess?.();
			}
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
				const signInResult = await signIn({ username, password: newPassword });
				if (signInResult.error) {
					error = 'Password reset, but sign-in failed. Try signing in manually.';
					mode = 'signin';
				} else {
					close();
					onAuthSuccess?.();
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
				if (result.error) {
					error = result.error;
				} else {
					close();
					onAuthSuccess?.();
				}
			} else {
				const result = await signIn({ username, password });
				if (result.error) {
					error = result.error;
				} else {
					close();
					onAuthSuccess?.();
				}
			}
		} catch (err) {
			error = 'Something went wrong. Try again.';
		} finally {
			isSubmitting = false;
		}
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
		supportsPasskeys = typeof window !== 'undefined' && !!window.PublicKeyCredential;
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

<div class="dropdown-root">
	<button
		bind:this={trigger}
		class="lego-btn {initialMode === 'signin' ? 'lego-neutral' : 'lego-emerald'}"
		class:open
		onclick={toggle}
	>
		{initialMode === 'signin' ? 'Sign In' : 'Sign Up'}
	</button>

	{#if open}
		<div bind:this={popover} class="dropdown-popover">
			<!-- Mode tabs -->
			<div class="mode-tabs">
				<button
					class="mode-tab"
					class:active={mode === 'signin'}
					onclick={() => switchMode('signin')}
				>
					Sign In
				</button>
				<button
					class="mode-tab"
					class:active={mode === 'signup'}
					onclick={() => switchMode('signup')}
				>
					Sign Up
				</button>
			</div>

			<div class="dropdown-content">
				{#if mode === 'recovery'}
					<form onsubmit={handleRecovery} class="auth-form">
						<input type="text" bind:value={username} placeholder="Username" required autocomplete="username" class="auth-input" />
						<input type="text" bind:value={recoveryCode} placeholder="Recovery code" required class="auth-input" style="font-family: monospace; letter-spacing: 0.1em;" />
						<input type="password" bind:value={newPassword} placeholder="New password" required minlength="10" maxlength="64" autocomplete="new-password" class="auth-input" />
						<input type="password" bind:value={confirmPassword} placeholder="Confirm password" required minlength="10" maxlength="64" autocomplete="new-password" class="auth-input" />

						{#if error}
							<p class="error-msg">{error}</p>
						{/if}

						<button type="submit" disabled={isSubmitting} class="submit-btn">
							{isSubmitting ? '...' : 'Reset Password'}
						</button>
					</form>
					<p class="back-link">
						<button onclick={() => switchMode('signin')}>Back to sign in</button>
					</p>
				{:else}
					<form onsubmit={handleSubmit} class="auth-form">
						{#if mode === 'signup'}
							<input
								type="text"
								bind:value={displayName}
								placeholder="Display name"
								class="auth-input"
							/>
						{/if}

						<input
							type="text"
							bind:value={username}
							placeholder="Username"
							required
							autocomplete="username"
							class="auth-input"
						/>

						<input
							type="password"
							bind:value={password}
							placeholder="Password"
							required
							minlength="10"
							maxlength="64"
							autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
							class="auth-input"
						/>

						{#if error}
							<p class="error-msg">{error}</p>
						{/if}

						<button
							type="submit"
							disabled={isSubmitting}
							class="submit-btn"
						>
							{#if isSubmitting}
								...
							{:else}
								{mode === 'signin' ? 'Sign In' : 'Create Account'}
							{/if}
						</button>
					</form>

					{#if mode === 'signin' && supportsPasskeys}
						<div class="divider"><span>or</span></div>
						<button onclick={handlePasskeySignIn} disabled={isSubmitting} class="passkey-btn">
							Sign in with Passkey
						</button>
					{/if}

					{#if mode === 'signin'}
						<p class="back-link">
							<button onclick={() => switchMode('recovery')}>Forgot password?</button>
						</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.dropdown-root {
		position: relative;
	}

	.dropdown-popover {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: 300px;
		border-radius: 14px;
		background: rgba(15, 14, 26, 0.88);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
		z-index: 50;
		overflow: hidden;
	}

	.mode-tabs {
		display: flex;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.mode-tab {
		flex: 1;
		padding: 12px 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: rgba(255, 255, 255, 0.35);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.2s, background 0.2s;
		position: relative;
	}

	.mode-tab:hover {
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.03);
	}

	.mode-tab.active {
		color: #fbbf24;
	}

	.mode-tab.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 20%;
		right: 20%;
		height: 2px;
		background: #fbbf24;
		border-radius: 1px;
	}

	.dropdown-content {
		padding: 16px;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.auth-input {
		width: 100%;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.85);
		outline: none;
		transition: border-color 0.15s;
	}

	.auth-input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}

	.auth-input:focus {
		border-color: rgba(245, 158, 11, 0.4);
	}

	.error-msg {
		font-size: 12px;
		color: #fca5a5;
		text-align: center;
	}

	.submit-btn {
		width: 100%;
		padding: 10px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		background: rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.25);
		cursor: pointer;
		transition: all 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		background: rgba(245, 158, 11, 0.3);
		border-color: rgba(245, 158, 11, 0.4);
	}

	.submit-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 12px 0;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
	}

	.divider span {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.25);
	}

	.passkey-btn {
		width: 100%;
		padding: 10px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
		transition: all 0.15s;
	}

	.passkey-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.8);
	}

	.back-link {
		text-align: center;
		margin-top: 10px;
	}

	.back-link button {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.3);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}

	.back-link button:hover {
		color: rgba(255, 255, 255, 0.6);
		text-decoration: underline;
	}
</style>
