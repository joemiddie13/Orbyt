<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CanvasRenderer, type CanvasObjectData } from '$lib/canvas/CanvasRenderer';
	import { useCurrentUser, initAuthService } from '$lib/auth';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import CanvasToolbar from '$lib/components/CanvasToolbar.svelte';
	import FriendCodeModal from '$lib/components/FriendCodeModal.svelte';
	import FriendsList from '$lib/components/FriendsList.svelte';
	import CanvasSwitcher from '$lib/components/CanvasSwitcher.svelte';
	import CreateCanvasModal from '$lib/components/CreateCanvasModal.svelte';
	import CreateBeaconModal from '$lib/components/CreateBeaconModal.svelte';
	import BeaconDetailPanel from '$lib/components/BeaconDetailPanel.svelte';
	import StickerPicker from '$lib/components/StickerPicker.svelte';

	let canvasContainer: HTMLDivElement;
	let renderer: CanvasRenderer;
	let authSettled = $state(false);

	const client = useConvexClient();
	const currentUser = useCurrentUser();

	// Initialize the auth service with the Convex client (for post-signup mutations)
	initAuthService(client);

	// Active canvas state — starts with personal canvas, can switch to shared
	let activeCanvasId = $state<string | null>(null);
	let activeCanvasName = $state<string>('My Canvas');

	// Modal state
	let showFriendCode = $state(false);
	let showFriendsList = $state(false);
	let showCanvasSwitcher = $state(false);
	let showCreateCanvas = $state(false);
	let showCreateBeacon = $state(false);
	let selectedBeacon = $state<any>(null);
	let stickerPickerState = $state<{ objectId: string; x: number; y: number } | null>(null);

	// Query the user's personal canvas once we have their UUID
	const personalCanvas = useQuery(
		api.canvases.getPersonalCanvas,
		() => currentUser.user?.uuid ? { ownerId: currentUser.user.uuid } : 'skip'
	);

	// Set the active canvas to personal canvas by default
	$effect(() => {
		if (personalCanvas.data && !activeCanvasId) {
			activeCanvasId = personalCanvas.data._id;
			activeCanvasName = personalCanvas.data.name;
		}
	});

	// Query canvas objects for the active canvas
	const canvasObjects = useQuery(
		api.objects.getByCanvas,
		() => activeCanvasId ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Query stickers for the active canvas
	const canvasStickers = useQuery(
		api.stickers.getByCanvas,
		() => activeCanvasId ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Auth settling — show modal faster for logged-out users
	$effect(() => {
		if (currentUser.isAuthenticated) {
			authSettled = true;
		}
	});

	// Backfill friend code for pre-Layer 3 users
	$effect(() => {
		if (currentUser.isAuthenticated && currentUser.user?.uuid && !currentUser.user?.friendCode) {
			client.mutation(api.users.ensureFriendCode, {}).catch(() => {});
		}
	});

	onMount(async () => {
		setTimeout(() => { authSettled = true; }, 800);

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

		// Wire up beacon tap → detail panel
		renderer.onBeaconTapped = (objectId) => {
			const obj = canvasObjects.data?.find((o: any) => o._id === objectId);
			if (obj && obj.type === 'beacon') {
				selectedBeacon = obj;
			}
		};

		// Wire up long-press → sticker picker
		renderer.onObjectLongPress = (objectId, screenX, screenY) => {
			stickerPickerState = { objectId, x: screenX, y: screenY };
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

	// Reactively sync stickers
	$effect(() => {
		if (renderer && canvasStickers.data) {
			renderer.syncStickers(canvasStickers.data as any[]);
		}
	});

	/** Add a new TextBlock at the center of the viewport */
	async function addNote() {
		if (!activeCanvasId || !currentUser.user) return;
		const center = renderer.getViewportCenter();

		const colors = [0xfff9c4, 0xc8e6c9, 0xbbdefb, 0xf8bbd0, 0xffe0b2];
		const color = colors[Math.floor(Math.random() * colors.length)];

		await client.mutation(api.objects.create, {
			canvasId: activeCanvasId as any,
			creatorId: currentUser.user.uuid,
			type: 'textblock',
			position: { x: center.x - 120, y: center.y - 40 },
			size: { w: 240, h: 80 },
			content: { text: 'New note...', color },
		});
	}

	/** Switch to a different canvas */
	function switchCanvas(canvasId: string, name: string) {
		activeCanvasId = canvasId;
		activeCanvasName = name;
		showCanvasSwitcher = false;
	}

	/** Handle new shared canvas creation */
	function onCanvasCreated(canvasId: string) {
		activeCanvasId = canvasId;
		activeCanvasName = 'New Canvas';
		showCreateCanvas = false;
	}

	/** Place a sticker on an object */
	async function placeSticker(stickerType: string) {
		if (!stickerPickerState) return;
		try {
			await client.mutation(api.stickers.addSticker, {
				objectId: stickerPickerState.objectId as any,
				stickerType,
				position: { x: Math.random() * 80 - 20, y: -15 + Math.random() * 10 },
			});
		} catch (err) {
			console.error('Failed to place sticker:', err);
		}
		stickerPickerState = null;
	}
</script>

<div bind:this={canvasContainer} class="w-screen h-screen overflow-hidden"></div>

{#if authSettled && !currentUser.isAuthenticated}
	<AuthModal />
{/if}

{#if currentUser.isAuthenticated}
	<CanvasToolbar
		username={currentUser.user?.displayName ?? currentUser.user?.username ?? ''}
		canvasName={activeCanvasName}
		onAddNote={addNote}
		onCreateBeacon={() => { showCreateBeacon = true; }}
		onFriends={() => { showFriendCode = true; }}
		onFriendsList={() => { showFriendsList = true; }}
		onCanvasSwitcher={() => { showCanvasSwitcher = !showCanvasSwitcher; }}
	/>
{/if}

<!-- Modals -->
{#if showFriendCode && currentUser.user}
	<FriendCodeModal
		friendCode={currentUser.user.friendCode ?? ''}
		onClose={() => { showFriendCode = false; }}
	/>
{/if}

{#if showFriendsList}
	<FriendsList onClose={() => { showFriendsList = false; }} />
{/if}

{#if showCanvasSwitcher}
	<CanvasSwitcher
		activeCanvasId={activeCanvasId}
		onSelect={switchCanvas}
		onCreateNew={() => { showCanvasSwitcher = false; showCreateCanvas = true; }}
		onClose={() => { showCanvasSwitcher = false; }}
	/>
{/if}

{#if showCreateCanvas}
	<CreateCanvasModal
		onCreated={onCanvasCreated}
		onClose={() => { showCreateCanvas = false; }}
	/>
{/if}

{#if showCreateBeacon && activeCanvasId && currentUser.user}
	<CreateBeaconModal
		canvasId={activeCanvasId}
		userUuid={currentUser.user.uuid}
		onClose={() => { showCreateBeacon = false; }}
	/>
{/if}

{#if selectedBeacon && currentUser.user}
	<BeaconDetailPanel
		beacon={selectedBeacon}
		userUuid={currentUser.user.uuid}
		onClose={() => { selectedBeacon = null; }}
	/>
{/if}

{#if stickerPickerState}
	<StickerPicker
		x={stickerPickerState.x}
		y={stickerPickerState.y}
		onSelect={placeSticker}
		onClose={() => { stickerPickerState = null; }}
	/>
{/if}
