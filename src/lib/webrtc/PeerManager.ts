import { PeerConnection, type SignalData } from './PeerConnection';
import type { DataChannelMessage, PeerManagerCallbacks } from './types';

/**
 * PeerManager — orchestrates all WebRTC peer connections for one canvas.
 *
 * Handles multi-peer mesh: each pair of viewers gets a direct data channel.
 * Deterministic initiator rule: lower UUID string initiates (prevents glare).
 * Throttled sends keep bandwidth reasonable.
 */

const CURSOR_THROTTLE = 50; // 20Hz — smooth cursor movement
const DRAG_THROTTLE = 40; // 25Hz — smooth drag streaming
const MAX_PROCESSED_SIGNALS = 500; // Cap to prevent unbounded growth (#11)
const DRAG_START_DEDUP_MS = 200; // Ignore duplicate drag-starts within 200ms (#12)

export class PeerManager {
	private peers = new Map<string, PeerConnection>();
	private localUserId: string;
	private localUsername: string;
	private canvasId: string | null = null;
	private callbacks: PeerManagerCallbacks;
	private destroyed = false;

	// Throttle state
	private lastCursorSend = 0;
	private lastDragSend = new Map<string, number>(); // objectId → timestamp

	// Track signals we've already processed to avoid duplicates
	private processedSignalIds = new Set<string>();

	// Dedup drag-start sends per objectId (#12)
	private lastDragStartSend = new Map<string, number>();

	constructor(
		localUserId: string,
		localUsername: string,
		callbacks: PeerManagerCallbacks,
	) {
		this.localUserId = localUserId;
		this.localUsername = localUsername;
		this.callbacks = callbacks;
	}

	/** Switch to a new canvas — tears down old connections */
	setCanvas(canvasId: string) {
		if (this.canvasId === canvasId) return;
		this.disconnectAll();
		this.canvasId = canvasId;
		this.processedSignalIds.clear();
	}

	/** A viewer was discovered on the current canvas — connect if we haven't */
	onViewerDiscovered(remoteUserId: string) {
		if (this.destroyed) return;
		if (remoteUserId === this.localUserId) return;
		if (this.peers.has(remoteUserId)) return;

		// Deterministic initiator: lower UUID string initiates
		const initiator = this.localUserId < remoteUserId;
		this.createPeer(remoteUserId, initiator);
	}

	/** A viewer left the canvas */
	onViewerLeft(remoteUserId: string) {
		const peer = this.peers.get(remoteUserId);
		if (peer) {
			peer.destroy();
			this.peers.delete(remoteUserId);
			this.callbacks.onPeerDisconnected(remoteUserId);
		}
	}

	/**
	 * Process incoming signaling messages from Convex.
	 * Returns the IDs of consumed signals (caller should delete them).
	 */
	processSignals(
		signals: Array<{
			_id: string;
			fromUserId: string;
			type: string;
			payload: string;
		}>,
	): string[] {
		if (this.destroyed) return [];

		const consumed: string[] = [];

		for (const signal of signals) {
			// Skip if we already processed this signal
			if (this.processedSignalIds.has(signal._id)) continue;
			this.processedSignalIds.add(signal._id);
			consumed.push(signal._id);

			let peer = this.peers.get(signal.fromUserId);

			// If we don't have a peer yet and this is an offer, create one (we're the responder)
			if (!peer && signal.type === 'offer') {
				peer = this.createPeer(signal.fromUserId, false);
			}

			if (peer) {
				try {
					const parsed = JSON.parse(signal.payload) as SignalData;
					peer.receiveSignal(parsed);
				} catch {
					// Malformed signal
				}
			}
		}

		// Cap processedSignalIds to prevent unbounded memory growth (#11)
		if (this.processedSignalIds.size > MAX_PROCESSED_SIGNALS) {
			const excess = this.processedSignalIds.size - MAX_PROCESSED_SIGNALS;
			let removed = 0;
			for (const id of this.processedSignalIds) {
				if (removed >= excess) break;
				this.processedSignalIds.delete(id);
				removed++;
			}
		}

		return consumed;
	}

	/** Send cursor position (throttled to 10Hz) */
	sendCursor(worldX: number, worldY: number) {
		const now = Date.now();
		if (now - this.lastCursorSend < CURSOR_THROTTLE) return;
		this.lastCursorSend = now;

		this.broadcast({
			type: 'cursor',
			userId: this.localUserId,
			username: this.localUsername,
			x: worldX,
			y: worldY,
		});
	}

	/** Send drag-start event (deduped per objectId within 200ms window) */
	sendDragStart(objectId: string) {
		const now = Date.now();
		const lastSend = this.lastDragStartSend.get(objectId) ?? 0;
		if (now - lastSend < DRAG_START_DEDUP_MS) return;
		this.lastDragStartSend.set(objectId, now);

		this.broadcast({
			type: 'drag-start',
			userId: this.localUserId,
			objectId,
		});
	}

	/** Send mid-drag position (throttled to ~15Hz per object) */
	sendDragPosition(objectId: string, x: number, y: number) {
		const now = Date.now();
		const lastSend = this.lastDragSend.get(objectId) ?? 0;
		if (now - lastSend < DRAG_THROTTLE) return;
		this.lastDragSend.set(objectId, now);

		this.broadcast({
			type: 'drag',
			userId: this.localUserId,
			objectId,
			x,
			y,
		});
	}

	/** Send final drag position (immediate, not throttled) */
	sendDragEnd(objectId: string, x: number, y: number) {
		this.lastDragSend.delete(objectId);
		this.lastDragStartSend.delete(objectId);

		this.broadcast({
			type: 'drag-end',
			userId: this.localUserId,
			objectId,
			x,
			y,
		});
	}

	/** Get count of connected peers */
	get connectedCount(): number {
		let count = 0;
		for (const peer of this.peers.values()) {
			if (peer.connected) count++;
		}
		return count;
	}

	/** Check if any peers are connected */
	get hasConnections(): boolean {
		return this.connectedCount > 0;
	}

	disconnectAll() {
		for (const [id, peer] of this.peers) {
			peer.destroy();
			this.callbacks.onPeerDisconnected(id);
		}
		this.peers.clear();
		this.lastDragSend.clear();
		this.lastDragStartSend.clear();
	}

	destroy() {
		this.destroyed = true;
		this.disconnectAll();
	}

	private createPeer(remoteUserId: string, initiator: boolean): PeerConnection {
		const peer = new PeerConnection(remoteUserId, initiator, {
			onSignal: (signal) => {
				this.callbacks.onSignal(remoteUserId, JSON.stringify(signal));
			},
			onData: (msg) => this.handleMessage(msg),
			onConnect: () => {
				this.callbacks.onPeerConnected(remoteUserId);
			},
			onClose: () => {
				this.peers.delete(remoteUserId);
				this.callbacks.onPeerDisconnected(remoteUserId);
			},
			onError: () => {
				this.peers.delete(remoteUserId);
				this.callbacks.onPeerDisconnected(remoteUserId);
			},
		});

		this.peers.set(remoteUserId, peer);
		return peer;
	}

	private handleMessage(msg: DataChannelMessage) {
		switch (msg.type) {
			case 'cursor':
				this.callbacks.onRemoteCursor(msg.userId, msg.username, msg.x, msg.y);
				break;
			case 'drag-start':
				this.callbacks.onRemoteDragStart(msg.userId, msg.objectId);
				break;
			case 'drag':
				this.callbacks.onRemoteDrag(msg.userId, msg.objectId, msg.x, msg.y);
				break;
			case 'drag-end':
				this.callbacks.onRemoteDragEnd(msg.userId, msg.objectId, msg.x, msg.y);
				break;
		}
	}

	private broadcast(msg: DataChannelMessage) {
		for (const peer of this.peers.values()) {
			peer.send(msg);
		}
	}
}
