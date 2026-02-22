<script lang="ts">
	import { generateRecoveryCodes } from '$lib/auth';
	import { animate } from 'motion';
	import { onMount } from 'svelte';

	let {
		hasExistingCodes = false,
		onClose,
	}: {
		hasExistingCodes?: boolean;
		onClose: () => void;
	} = $props();

	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let copied = $state(false);
	let codes = $state<string[] | null>(null);
	let isGenerating = $state(false);
	let error = $state('');

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
		animate(panel, { opacity: [0, 1], scale: [0.95, 1] }, { duration: 0.3 });
	});

	async function handleGenerate() {
		isGenerating = true;
		error = '';
		const result = await generateRecoveryCodes();
		if (result.codes) {
			codes = result.codes;
		} else {
			error = result.error ?? 'Failed to generate codes';
		}
		isGenerating = false;
	}

	async function copyAll() {
		if (!codes) return;
		const text = codes.join('\n');
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	function downloadCodes() {
		if (!codes) return;
		const text = [
			'Orbyt Recovery Codes',
			'====================',
			'',
			'Save these codes somewhere safe.',
			'Each code can only be used once.',
			'',
			...codes.map((c, i) => `${(i + 1).toString().padStart(2, ' ')}. ${c}`),
			'',
			`Generated: ${new Date().toISOString()}`,
		].join('\n');

		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'orbyt-recovery-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div bind:this={backdrop} class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop">
	<div bind:this={panel} class="w-full max-w-md mx-4 rounded-2xl glass-panel p-8">
		<h2 class="text-lg font-bold text-center text-white mb-1">
			Recovery Codes
		</h2>

		{#if !codes}
			<!-- Confirmation step — don't generate until user clicks -->
			<p class="text-sm text-center text-white/50 mt-4 mb-6">
				{#if hasExistingCodes}
					You already have recovery codes. Generating new ones will <span class="text-amber-400/80">replace your existing codes</span> — the old ones will stop working.
				{:else}
					Recovery codes let you reset your password if you lose access to your account. Each code can only be used once.
				{/if}
			</p>

			{#if error}
				<p class="text-sm text-red-400 text-center mb-4">{error}</p>
			{/if}

			<div class="flex gap-3">
				<button
					onclick={onClose}
					class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] border border-white/[0.1] text-white/50 hover:bg-white/[0.1] transition cursor-pointer"
				>
					Cancel
				</button>
				<button
					onclick={handleGenerate}
					disabled={isGenerating}
					class="flex-1 lego-btn lego-amber"
				>
					{#if isGenerating}
						Generating...
					{:else}
						{hasExistingCodes ? 'Regenerate Codes' : 'Generate Codes'}
					{/if}
				</button>
			</div>
		{:else}
			<!-- Codes generated — show them -->
			<p class="text-xs text-center text-amber-400/80 mb-5">
				Save these codes somewhere safe. They won't be shown again.
			</p>

			<div class="grid grid-cols-2 gap-2 mb-5">
				{#each codes as code, i}
					<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
						<span class="text-xs text-white/30 w-4">{i + 1}.</span>
						<span class="font-mono text-sm text-white/80 tracking-wider">{code}</span>
					</div>
				{/each}
			</div>

			<div class="flex gap-3 mb-4">
				<button
					onclick={copyAll}
					class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] transition cursor-pointer"
				>
					{copied ? 'Copied!' : 'Copy all'}
				</button>
				<button
					onclick={downloadCodes}
					class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] transition cursor-pointer"
				>
					Download .txt
				</button>
			</div>

			<p class="text-xs text-white/30 text-center mb-5">
				Each code can only be used once. Use them if you forget your password and can't use your passkey.
			</p>

			<button
				onclick={onClose}
				class="w-full lego-btn lego-btn-full lego-amber"
			>
				I've saved my codes
			</button>
		{/if}
	</div>
</div>
