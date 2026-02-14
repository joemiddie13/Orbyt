/**
 * WebRTC data channel message types.
 *
 * These are the messages sent peer-to-peer over WebRTC data channels.
 * High-frequency, ephemeral — not persisted. Convex stays authoritative
 * for all durable state.
 */

export type DataChannelMessage =
	| CursorMessage
	| DragStartMessage
	| DragMessage
	| DragEndMessage
	| PingMessage
	| PongMessage;

export interface CursorMessage {
	type: 'cursor';
	userId: string;
	username: string;
	x: number; // world coordinates
	y: number;
}

export interface DragStartMessage {
	type: 'drag-start';
	userId: string;
	objectId: string;
}

export interface DragMessage {
	type: 'drag';
	userId: string;
	objectId: string;
	x: number; // world coordinates
	y: number;
}

export interface DragEndMessage {
	type: 'drag-end';
	userId: string;
	objectId: string;
	x: number;
	y: number;
}

export interface PingMessage {
	type: 'ping';
}

export interface PongMessage {
	type: 'pong';
}

/** A remote user's cursor state for rendering */
export interface RemoteCursor {
	userId: string;
	username: string;
	x: number;
	y: number;
	lastUpdate: number;
}

/** Callbacks from PeerConnection/PeerManager to the page */
export interface PeerManagerCallbacks {
	onRemoteCursor: (userId: string, username: string, x: number, y: number) => void;
	onRemoteDragStart: (userId: string, objectId: string) => void;
	onRemoteDrag: (userId: string, objectId: string, x: number, y: number) => void;
	onRemoteDragEnd: (userId: string, objectId: string, x: number, y: number) => void;
	onPeerConnected: (userId: string) => void;
	onPeerDisconnected: (userId: string) => void;
	onSignal: (toUserId: string, signal: string) => void;
}
