<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CanvasRenderer, type CanvasObjectData } from '$lib/canvas/CanvasRenderer';
	import { useCurrentUser, initAuthService } from '$lib/auth';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import CanvasToolbar from '$lib/components/CanvasToolbar.svelte';

	let canvasContainer: HTMLDivElement;
	let renderer: CanvasRenderer;
	let authSettled = $state(false);

	const client = useConvexClient();
	const currentUser = useCurrentUser();

	// Initialize the auth service with the Convex client (for post-signup mutations)
	initAuthService(client);

	// Query the user's personal canvas once we have their UUID
	const personalCanvas = useQuery(
		api.canvases.getPersonalCanvas,
		() => currentUser.user?.uuid ? { ownerId: currentUser.user.uuid } : 'skip'
	);

	// Query canvas objects once we have the canvas ID
	const canvasObjects = useQuery(
		api.objects.getByCanvas,
		() => personalCanvas.data?._id ? { canvasId: personalCanvas.data._id } : 'skip'
	);

	// If the user is authenticated, we never need to show the modal.
	// If they're not, wait for the auth token to settle before deciding.
	// The two-phase problem: Convex queries run before the auth token is set,
	// so the first result is always "not authenticated". We wait for the
	// token to propagate and the query to re-fire before trusting the result.
	$effect(() => {
		if (currentUser.isAuthenticated) {
			authSettled = true;
		}
	});

	onMount(async () => {
		// Fallback for genuinely logged-out users — show the modal after
		// enough time for the auth token to have resolved if it existed.
		setTimeout(() => { authSettled = true; }, 1500);

		renderer = new CanvasRenderer();
		await renderer.init(canvasContainer);

		// Wire up drag-end → Convex mutation
		renderer.onObjectMoved = async (objectId, x, y) => {
			try {
				await client.mutation(api.objects.updatePosition, {
					id: objectId as any,
					position: { x, y },
				});
			} catch (err) {
				console.error('Failed to save position:', err);
			}
		};
	});

	onDestroy(() => {
		if (renderer) renderer.destroy();
	});

	// Reactively sync canvas objects from Convex → PixiJS
	$effect(() => {
		if (renderer && canvasObjects.data) {
			renderer.syncObjects(canvasObjects.data as CanvasObjectData[]);
		}
	});

	/** Add a new TextBlock at the center of the viewport */
	async function addNote() {
		if (!personalCanvas.data || !currentUser.user) return;
		const center = renderer.getViewportCenter();

		const colors = [0xfff9c4, 0xc8e6c9, 0xbbdefb, 0xf8bbd0, 0xffe0b2];
		const color = colors[Math.floor(Math.random() * colors.length)];

		await client.mutation(api.objects.create, {
			canvasId: personalCanvas.data._id,
			creatorId: currentUser.user.uuid,
			type: 'textblock',
			position: { x: center.x - 120, y: center.y - 40 },
			size: { w: 240, h: 80 },
			content: { text: 'New note...', color },
		});
	}
</script>

<div bind:this={canvasContainer} class="w-screen h-screen overflow-hidden"></div>

{#if authSettled && !currentUser.isAuthenticated}
	<AuthModal />
{/if}

{#if currentUser.isAuthenticated}
	<CanvasToolbar
		username={currentUser.user?.displayName ?? currentUser.user?.username ?? ''}
		onAddNote={addNote}
	/>
{/if}
