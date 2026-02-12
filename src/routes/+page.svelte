<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CanvasRenderer, type CanvasObjectData } from '$lib/canvas/CanvasRenderer';
	import { useCurrentUser, initAuthService } from '$lib/auth';
	import { PeerManager } from '$lib/webrtc';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import CanvasToolbar from '$lib/components/CanvasToolbar.svelte';
	import FriendCodeModal from '$lib/components/FriendCodeModal.svelte';
	import FriendsList from '$lib/components/FriendsList.svelte';
	import CanvasSwitcher from '$lib/components/CanvasSwitcher.svelte';
	import CreateCanvasModal from '$lib/components/CreateCanvasModal.svelte';
	import CreateBeaconModal from '$lib/components/CreateBeaconModal.svelte';
	import BeaconDetailPanel from '$lib/components/BeaconDetailPanel.svelte';
	import StickerPicker from '$lib/components/StickerPicker.svelte';
	import ViewerAvatars from '$lib/components/ViewerAvatars.svelte';

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

	// WebRTC state
	let peerManager = $state<PeerManager | null>(null);
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let webrtcConnected = $state(false);

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

	// Always-subscribed query for canvas switcher — data is ready instantly when dropdown opens
	const accessibleCanvases = useQuery(
		api.access.getAccessibleCanvases,
		() => currentUser.isAuthenticated ? {} : 'skip'
	);

	// Presence: who's viewing this canvas
	const canvasViewers = useQuery(
		api.presence.getViewers,
		() => activeCanvasId && currentUser.isAuthenticated ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Signaling: incoming WebRTC signals for the current user
	const incomingSignals = useQuery(
		api.signaling.getSignals,
		() => activeCanvasId && currentUser.isAuthenticated ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Auth settling — show modal faster for logged-out users
	$effect(() => {
		if (currentUser.isAuthenticated) {
			authSettled = true;
		}
	});

	// Recovery: if auth exists but Astrophage user record is missing, create it
	$effect(() => {
		if (
			currentUser.isAuthenticated &&
			!currentUser.isLoading &&
			currentUser.user &&
			!currentUser.user.uuid // empty string = no Astrophage record
		) {
			const username = currentUser.user.username;
			const displayName = currentUser.user.displayName || username;
			if (username) {
				client
					.mutation(api.users.createUser, { username, displayName })
					.catch(() => {});
			}
		}
	});

	// Backfill friend code for pre-Layer 3 users
	$effect(() => {
		if (currentUser.isAuthenticated && currentUser.user?.uuid && !currentUser.user?.friendCode) {
			client.mutation(api.users.ensureFriendCode, {}).catch(() => {});
		}
	});

	// Initialize PeerManager when user authenticates
	$effect(() => {
		const user = currentUser.user;
		if (!user?.uuid || !renderer) return;

		// Already have a PeerManager for this user
		if (peerManager) return;

		console.log('[WebRTC] PeerManager created for', user.username);
		peerManager = new PeerManager(user.uuid, user.username, {
			onRemoteCursor: (userId, username, x, y) => {
				renderer?.updateRemoteCursor(userId, username, x, y);
			},
			onRemoteDrag: (_userId, objectId, x, y) => {
				renderer?.moveObjectRemotely(objectId, x, y);
			},
			onRemoteDragEnd: (_userId, objectId, x, y) => {
				renderer?.moveObjectRemotely(objectId, x, y);
			},
			onPeerConnected: (userId) => {
				console.log('[WebRTC] Peer CONNECTED:', userId);
				webrtcConnected = peerManager?.hasConnections ?? false;
			},
			onPeerDisconnected: (userId) => {
				console.log('[WebRTC] Peer DISCONNECTED:', userId);
				webrtcConnected = peerManager?.hasConnections ?? false;
			},
			onSignal: (toUserId, signal) => {
				if (!activeCanvasId) return;
				// Determine signal type from the parsed signal data
				let type: 'offer' | 'answer' | 'ice-candidate' = 'ice-candidate';
				try {
					const parsed = JSON.parse(signal);
					if (parsed.type === 'offer') type = 'offer';
					else if (parsed.type === 'answer') type = 'answer';
				} catch { /* default to ice-candidate */ }

				client.mutation(api.signaling.sendSignal, {
					canvasId: activeCanvasId as any,
					toUserId,
					type,
					payload: signal,
				}).catch((err: unknown) => console.error('Signal send failed:', err));
			},
		});
	});

	// Presence lifecycle: join canvas, heartbeat, leave on switch
	$effect(() => {
		const canvasId = activeCanvasId;
		const user = currentUser.user;
		if (!canvasId || !user?.uuid) return;

		console.log('[WebRTC] Joining canvas:', canvasId);
		// Join this canvas
		client.mutation(api.presence.joinCanvas, { canvasId: canvasId as any }).catch(() => {});

		// Set PeerManager canvas
		peerManager?.setCanvas(canvasId);

		// Clear old cursors
		renderer?.removeAllRemoteCursors();

		// Start heartbeat
		if (heartbeatInterval) clearInterval(heartbeatInterval);
		heartbeatInterval = setInterval(() => {
			client.mutation(api.presence.heartbeat, { canvasId: canvasId as any }).catch(() => {});
		}, 30_000);

		return () => {
			// Leave canvas on cleanup (canvas switch or unmount)
			client.mutation(api.presence.leaveCanvas, { canvasId: canvasId as any }).catch(() => {});
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
				heartbeatInterval = null;
			}
		};
	});

	// Process incoming signaling messages
	$effect(() => {
		const signals = incomingSignals.data;
		if (!signals || signals.length === 0 || !peerManager) return;

		console.log('[WebRTC] Processing', signals.length, 'signals');
		const consumed = peerManager.processSignals(signals as any[]);

		// Delete consumed signals from Convex
		for (const id of consumed) {
			client.mutation(api.signaling.consumeSignal, { signalId: id as any }).catch(() => {});
		}
	});

	// Discover new viewers → trigger WebRTC connections
	$effect(() => {
		const viewers = canvasViewers.data;
		if (!viewers || !peerManager || !currentUser.user?.uuid) return;

		const myUuid = currentUser.user.uuid;
		const others = viewers.filter((v: any) => v.userId !== myUuid);
		if (others.length > 0) {
			console.log('[WebRTC] Viewers on canvas:', others.map((v: any) => v.username));
		}

		for (const viewer of others) {
			peerManager.onViewerDiscovered(viewer.userId);
		}
	});

	onMount(async () => {
		setTimeout(() => { authSettled = true; }, 800);

		renderer = new CanvasRenderer();
		await renderer.init(canvasContainer);

		// Wire up drag-end → Convex mutation + WebRTC broadcast
		renderer.onObjectMoved = async (objectId, x, y) => {
			peerManager?.sendDragEnd(objectId, x, y);
			try {
				await client.mutation(api.objects.updatePosition, {
					id: objectId as any,
					position: { x, y },
				});
			} catch (err) {
				console.error('Failed to save position:', err);
			}
		};

		// Wire up mid-drag → WebRTC broadcast
		renderer.onObjectDragging = (objectId, x, y) => {
			peerManager?.sendDragPosition(objectId, x, y);
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

		// Stream cursor position over WebRTC
		renderer.app.stage.eventMode = 'static';
		renderer.app.stage.hitArea = renderer.app.screen;
		renderer.app.stage.on('pointermove', (event) => {
			if (!peerManager) return;
			const world = renderer.screenToWorld(event.globalX, event.globalY);
			peerManager.sendCursor(world.x, world.y);
		});
	});

	onDestroy(() => {
		peerManager?.destroy();
		peerManager = null;
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
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
		{webrtcConnected}
	/>
{/if}

{#if currentUser.isAuthenticated && canvasViewers.data && canvasViewers.data.length > 1}
	<ViewerAvatars
		viewers={canvasViewers.data}
		currentUserId={currentUser.user?.uuid ?? ''}
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
		canvases={accessibleCanvases.data}
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
