<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';

	let {
		friendCode,
	}: {
		friendCode: string;
	} = $props();

	const client = useConvexClient();

	let open = $state(false);
	let popover = $state<HTMLDivElement>(undefined!);
	let trigger = $state<HTMLButtonElement>(undefined!);

	let displayCode = $state(friendCode);
	let inputCode = $state('');
	let copied = $state(false);
	let sending = $state(false);
	let message = $state<{ text: string; type: 'success' | 'error' } | null>(null);

	// Keep displayCode in sync when friendCode prop changes
	$effect(() => {
		if (friendCode) displayCode = friendCode;
	});

	// Backfill friend code for pre-Layer 3 users
	if (!friendCode) {
		client.mutation(api.users.ensureFriendCode, {}).then((code) => {
			if (code) displayCode = code;
		}).catch(() => {});
	}

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			message = null;
			requestAnimationFrame(() => {
				if (!popover) return;
				gsap.fromTo(popover,
					{ scale: 0.6, opacity: 0, transformOrigin: 'top right' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
			});
		}
	}

	function close() {
		if (!open || !popover) { open = false; return; }
		gsap.to(popover, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'top right',
			onComplete: () => { open = false; },
		});
	}

	async function copyCode() {
		await navigator.clipboard.writeText(displayCode);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	async function sendRequest() {
		const code = inputCode.trim();
		if (!code) return;

		sending = true;
		message = null;
		try {
			await client.mutation(api.friendships.sendRequest, { friendCode: code });
			message = { text: 'Request sent!', type: 'success' };
			inputCode = '';
		} catch (err: any) {
			message = { text: err.message || 'Failed to send request', type: 'error' };
		} finally {
			sending = false;
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
		class="dropdown-trigger"
		class:open
		onclick={toggle}
		title="Friend Code"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
		</svg>
	</button>

	{#if open}
		<div bind:this={popover} class="dropdown-popover">
			<div class="dropdown-header">
				<span class="dropdown-title">FRIEND CODE</span>
			</div>

			<div class="dropdown-content">
				<!-- Your friend code -->
				<div class="section">
					<p class="section-label">Your code</p>
					<div class="code-row">
						<code class="code-display">
							{displayCode || '...'}
						</code>
						<button onclick={copyCode} class="copy-btn">
							{copied ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<p class="hint">Share this so friends can connect with you</p>
				</div>

				<!-- Add a friend -->
				<div class="section">
					<p class="section-label">Add a friend</p>
					<div class="code-row">
						<input
							type="text"
							bind:value={inputCode}
							placeholder="Enter code"
							maxlength="10"
							class="code-input"
							onkeydown={(e) => { if (e.key === 'Enter') sendRequest(); }}
						/>
						<button
							onclick={sendRequest}
							disabled={sending || !inputCode.trim()}
							class="add-btn"
						>
							{sending ? '...' : 'Add'}
						</button>
					</div>
					{#if message}
						<p class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
							{message.text}
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.dropdown-root {
		position: relative;
	}

	.dropdown-trigger {
		position: relative;
		padding: 6px 8px;
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.6);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.2s, background 0.2s;
	}

	.dropdown-trigger:hover,
	.dropdown-trigger.open {
		color: rgba(255, 255, 255, 0.85);
		background: rgba(255, 255, 255, 0.1);
	}

	.dropdown-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 280px;
		border-radius: 14px;
		background: rgba(15, 14, 26, 0.82);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
		z-index: 50;
		overflow: hidden;
	}

	.dropdown-header {
		padding: 14px 16px 8px;
	}

	.dropdown-title {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.35);
	}

	.dropdown-content {
		padding: 0 12px 12px;
	}

	.section {
		margin-bottom: 12px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section-label {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 6px;
		padding: 0 2px;
	}

	.code-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.code-display {
		flex: 1;
		padding: 6px 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		text-align: center;
		font-family: monospace;
		font-size: 14px;
		letter-spacing: 0.12em;
		color: rgba(255, 255, 255, 0.85);
	}

	.copy-btn {
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.6);
		border: none;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.85);
	}

	.hint {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.25);
		margin-top: 4px;
		padding: 0 2px;
	}

	.code-input {
		flex: 1;
		padding: 6px 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.85);
		outline: none;
		transition: border-color 0.15s;
	}

	.code-input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}

	.code-input:focus {
		border-color: rgba(255, 255, 255, 0.2);
	}

	.add-btn {
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 500;
		background: rgba(245, 158, 11, 0.15);
		color: #fbbf24;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.add-btn:hover:not(:disabled) {
		background: rgba(245, 158, 11, 0.25);
	}

	.add-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.message {
		font-size: 11px;
		margin-top: 4px;
		padding: 0 2px;
	}

	.message.success {
		color: #6ee7b7;
	}

	.message.error {
		color: #fca5a5;
	}
</style>
