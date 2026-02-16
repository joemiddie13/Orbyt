# Privacy, Security & Decentralization Roadmap

Orbyt is built on the belief that social platforms should respect user privacy, give people ownership of their data, and never exploit attention for profit. This document outlines where we're headed.

## AT Protocol Integration

We've researched the [AT Protocol](https://atproto.com/) (the decentralized social protocol behind Bluesky) as a long-term foundation for Orbyt. The protocol's values — user data ownership, account portability, no platform lock-in — align directly with ours.

### What fits well

- **Decentralized identity (DIDs)** replace usernames with portable, cryptographic identifiers. Users could sign in with their Bluesky handle or any AT Protocol identity — no passwords to manage, no vendor lock-in.
- **User-owned data repositories** mean your canvas objects, beacons, and social connections belong to you, not to us. If Orbyt ever shuts down, your data lives on.
- **Custom Lexicon schemas** (`com.orbyt.*`) would let us define canvas-native record types that other apps could read and interoperate with.
- **Our auth abstraction layer** (`src/lib/auth/`) was designed from day one for this migration — only a single file needs to change.

### What doesn't fit yet

- **All AT Protocol data is currently public.** There is no private data support. This is a dealbreaker for personal canvases, shared canvas RBAC, and direct beacons. A [Private Data Working Group](https://github.com/bluesky-social/atproto/discussions/3363) exists but has no shipping timeline.
- **Real-time collaboration needs aren't served.** AT Protocol is publish/subscribe, not real-time. WebRTC cursor presence, drag streaming, and canvas presence heartbeats require infrastructure the protocol doesn't provide. Convex (or similar) stays for this.
- **Schema immutability.** Published Lexicon schemas can never have breaking changes — only additive optional fields. For a project still iterating, this demands careful upfront design.

### Phased hybrid approach

1. **Now** — Ship on Better Auth + Convex. Focus on the product, not the protocol.
2. **Next** — Add AT Protocol OAuth as a sign-in option. Users authenticate with their DID; we map it to our existing UUID system. One new method in `authService.ts`.
3. **When private data ships** — Gradually move public data to user repos. Canvases and social graph become portable. Convex remains the real-time engine.
4. **Long-term** — Full federation. Users host their own data. Our AppView indexes the network. True data sovereignty.

## Encryption

Privacy isn't just about access control — it's about who can read the data at all.

### Current state

Data at rest is protected by Convex's infrastructure. Data in transit is encrypted via TLS (HTTPS/WSS). WebRTC data channels use DTLS encryption by default. But the platform operator (us) can read user data server-side.

### Where we want to go

- **End-to-end encrypted canvases.** Canvas content encrypted client-side before it reaches the server. Only users with the canvas key can decrypt. The server stores ciphertext it can't read.
- **Forward secrecy for direct beacons.** Direct beacons between friends should be encrypted such that compromising a key today doesn't expose past messages.
- **Zero-knowledge social graph.** Friendship relationships stored as encrypted references. The server facilitates connections without knowing who is friends with whom.

These are hard problems — key distribution, group key management, and encrypted search all have active research communities. We're watching projects like [MLS (Messaging Layer Security)](https://www.rfc-editor.org/rfc/rfc9420.html) and the AT Protocol Private Data Working Group for standards to build on rather than inventing our own crypto.

## Security Roadmap

Authentication currently uses username/password via Better Auth. The auth layer is abstracted behind a single service file, designed for easy migration.

**Next step: Passkeys.** Passwordless, phishing-resistant authentication using device biometrics (Face ID, Touch ID, Windows Hello). No passwords to steal, no emails to leak. This aligns with the app's privacy-first philosophy and the eventual move to AT Protocol's decentralized identity (DIDs).

## Principles

No matter what protocols or encryption schemes we adopt, these principles don't change:

- **No email required.** Identity shouldn't depend on a corporate email provider.
- **No tracking.** No analytics, no fingerprinting, no ad networks.
- **No dark patterns.** The app is designed to be closed, not kept open.
- **Data portability.** Users should be able to leave and take everything with them.
- **Transparency.** The code is open source (AGPL-3.0). The roadmap is public. Trust is earned, not assumed.
