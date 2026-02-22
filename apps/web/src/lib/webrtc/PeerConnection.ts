import type { DataChannelMessage } from './types';

/**
 * PeerConnection — wraps a native RTCPeerConnection for one remote user.
 *
 * Uses the browser's built-in WebRTC API directly (no library needed).
 * Handles data channel creation, SDP exchange, ICE candidates, and keepalive.
 * Google STUN server for NAT traversal. No TURN — if it fails, Convex
 * fallback works exactly as before.
 *
 * ICE candidates are buffered until the remote description is set, because
 * signals arrive via Convex reactive queries and may be batched together
 * (offer + ICE candidates in the same tick).
 */

const ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
	{ urls: 'stun:stun2.l.google.com:19302' },
];
const PING_INTERVAL = 15_000; // 15s keepalive
const DATA_CHANNEL_LABEL = 'astrophage';

/** Signal types that flow through Convex signaling table */
export type SignalData =
	| { type: 'offer'; sdp: string }
	| { type: 'answer'; sdp: string }
	| { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export interface PeerConnectionCallbacks {
	onSignal: (signal: SignalData) => void;
	onData: (msg: DataChannelMessage) => void;
	onConnect: () => void;
	onClose: () => void;
	onError: (err: Error) => void;
}

export class PeerConnection {
	readonly remoteUserId: string;
	private pc: RTCPeerConnection;
	private dc: RTCDataChannel | null = null;
	private pingInterval: ReturnType<typeof setInterval> | null = null;
	private destroyed = false;
	private _connected = false;
	private callbacks: PeerConnectionCallbacks;

	// Buffer ICE candidates until remote description is set
	private iceCandidateBuffer: RTCIceCandidateInit[] = [];
	private hasRemoteDescription = false;

	// Sequential signal processing queue
	private signalQueue: SignalData[] = [];
	private processingSignal = false;

	constructor(
		remoteUserId: string,
		initiator: boolean,
		callbacks: PeerConnectionCallbacks,
	) {
		this.remoteUserId = remoteUserId;
		this.callbacks = callbacks;

		this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

		// Send ICE candidates to remote peer via signaling
		this.pc.onicecandidate = (event) => {
			if (this.destroyed || !event.candidate) return;
			callbacks.onSignal({
				type: 'ice-candidate',
				candidate: event.candidate.toJSON(),
			});
		};

		this.pc.onconnectionstatechange = () => {
			if (this.destroyed) return;
			const state = this.pc.connectionState;
			if (state === 'failed' || state === 'closed') {
				this.cleanup();
				callbacks.onClose();
			}
		};

		if (initiator) {
			// Initiator creates the data channel and then the offer
			// Unordered + unreliable = lowest latency for ephemeral position data
			this.dc = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
				ordered: false,
				maxRetransmits: 0,
			});
			this.setupDataChannel(this.dc);
			this.createOffer();
		} else {
			// Responder waits for the data channel from the initiator
			this.pc.ondatachannel = (event) => {
				this.dc = event.channel;
				this.setupDataChannel(this.dc);
			};
		}
	}

	/** Queue a signal for sequential processing */
	receiveSignal(signal: SignalData) {
		if (this.destroyed) return;
		this.signalQueue.push(signal);
		this.processNextSignal();
	}

	/** Process signals one at a time to avoid race conditions */
	private async processNextSignal() {
		if (this.processingSignal || this.signalQueue.length === 0 || this.destroyed) return;
		this.processingSignal = true;

		const signal = this.signalQueue.shift()!;
		try {
			await this.handleSignal(signal);
		} catch (err) {
			console.warn('[WebRTC] Signal handling error:', err);
		}

		this.processingSignal = false;
		// Process next signal in queue
		if (this.signalQueue.length > 0) {
			this.processNextSignal();
		}
	}

	private async handleSignal(signal: SignalData) {
		if (signal.type === 'offer') {
			await this.pc.setRemoteDescription(
				new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }),
			);
			this.hasRemoteDescription = true;
			await this.flushIceCandidates();

			const answer = await this.pc.createAnswer();
			await this.pc.setLocalDescription(answer);
			this.callbacks.onSignal({
				type: 'answer',
				sdp: answer.sdp!,
			});
		} else if (signal.type === 'answer') {
			await this.pc.setRemoteDescription(
				new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }),
			);
			this.hasRemoteDescription = true;
			await this.flushIceCandidates();
		} else if (signal.type === 'ice-candidate') {
			if (this.hasRemoteDescription) {
				await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
			} else {
				this.iceCandidateBuffer.push(signal.candidate);
			}
		}
	}

	/** Flush buffered ICE candidates after remote description is set */
	private async flushIceCandidates() {
		for (const candidate of this.iceCandidateBuffer) {
			try {
				await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
			} catch {
				// Candidate may be stale
			}
		}
		this.iceCandidateBuffer = [];
	}

	/** Send a message over the data channel */
	send(msg: DataChannelMessage) {
		if (this.destroyed || !this.dc || this.dc.readyState !== 'open') return;
		try {
			this.dc.send(JSON.stringify(msg));
		} catch {
			// Channel not ready or buffer full
		}
	}

	get connected(): boolean {
		return !this.destroyed && this._connected;
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.signalQueue = [];
		this.iceCandidateBuffer = [];
		this.cleanup();
		try {
			this.dc?.close();
			this.pc.close();
		} catch {
			// Already closed
		}
	}

	private async createOffer() {
		try {
			const offer = await this.pc.createOffer();
			await this.pc.setLocalDescription(offer);
			this.callbacks.onSignal({
				type: 'offer',
				sdp: offer.sdp!,
			});
		} catch (err) {
			if (!this.destroyed) {
				this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private setupDataChannel(dc: RTCDataChannel) {
		dc.binaryType = 'arraybuffer';

		dc.onopen = () => {
			if (this.destroyed) return;
			this._connected = true;
			this.callbacks.onConnect();
			this.startPing();
		};

		dc.onclose = () => {
			if (this.destroyed) return;
			this._connected = false;
			this.cleanup();
			this.callbacks.onClose();
		};

		dc.onerror = () => {
			if (this.destroyed) return;
			this._connected = false;
			this.cleanup();
			this.callbacks.onError(new Error('Data channel error'));
		};

		dc.onmessage = (event) => {
			if (this.destroyed) return;
			try {
				const msg = JSON.parse(event.data) as DataChannelMessage;
				if (msg.type === 'ping') {
					this.send({ type: 'pong' });
					return;
				}
				if (msg.type === 'pong') {
					return;
				}
				// Override userId with known remote peer identity — never trust self-reported identity
				if ('userId' in msg) {
					(msg as any).userId = this.remoteUserId;
				}
				this.callbacks.onData(msg);
			} catch {
				// Malformed message
			}
		};
	}

	private startPing() {
		this.pingInterval = setInterval(() => {
			this.send({ type: 'ping' });
		}, PING_INTERVAL);
	}

	private cleanup() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}
}
