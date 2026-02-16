# Orbyt

A non-addictive social connection platform. No feeds, no algorithms, no like counts. Just a canvas where you see your people, make plans, and close the app.

The entire UI is a PixiJS canvas — not a traditional web page. Users place objects on bounded canvases, create beacons (spontaneous or planned events), and connect in real life.

**[orbyt.life](https://orbyt.life)**

Built for the [**Built with Opus 4.6**](https://cerebralvalley.ai/e/claude-code-hackathon) hackathon, hosted by [Cerebral Valley](https://cerebralvalley.ai) & [Anthropic](https://anthropic.com). ([announcement](https://x.com/claudeai/status/2019833113418035237))

## Philosophy

- **Open, see your people, make plans, close.** The app is designed to encourage closing it.
- **No infinite scroll** — bounded canvas spaces only
- **No algorithmic ranking** — spatial or chronological arrangement
- **No like counts** — sticker reactions only, no numbers
- **No ads, no data harvesting, no GPS/live location**
- **Creator controls content lifespan**
- **Privacy-first** — username-only signup, no email required
- **Your data, your rules** — user-owned, never sold, never exploited

## Tech Stack

- **SvelteKit** (Svelte 5) + TypeScript strict mode
- **PixiJS v8** — WebGL canvas rendering
- **Convex** — Real-time backend with WebSocket sync
- **Better Auth** — Username/password authentication
- **Claude Opus 4.6** — AI-assisted beacon creation (activity suggestions based on location, interests, and time)
- **GSAP** + PixiPlugin — Canvas and UI animations
- **Tailwind CSS v4** — Styling for UI overlays
- **Motion** — DOM/UI animations
- **Tiptap** — Rich text editing (bold, italic, headings, lists)
- **chrono-node** — Natural language time parsing for beacons

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev) account

### Setup

```bash
# Install dependencies
npm install

# Initialize Convex (creates project + populates .env.local)
npx convex dev

# Set auth environment variables on your Convex deployment
npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)
npx convex env set SITE_URL http://localhost:5173
```

### Development

Run both servers in separate terminals:

```bash
# Terminal 1 — Convex (watches for backend changes)
npx convex dev

# Terminal 2 — Vite (frontend dev server)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the app.

### Other Commands

```bash
npm run build          # Production build
npm run check          # TypeScript type check
npm run check:watch    # Type check with live reload
```

## Architecture

The canvas IS the app. There are no traditional HTML pages or route-based views. Everything renders on a PixiJS WebGL canvas with UI overlays (auth modal, toolbar, beacon detail panel) positioned on top.

**Canvas layer**: PixiJS Application with a world Container. Pan/zoom moves the world; objects are children of it. Drag-and-drop uses `stopPropagation()` to prevent conflicts with panning. Deep space background with a parallax star field and warm parchment-colored bounded canvas.

**Backend**: Convex provides the database (9 tables), real-time subscriptions, and serverless functions. Canvas objects sync across tabs automatically via WebSocket. Compound indexes eliminate post-filter scans.

**Auth**: Better Auth with a Convex adapter. An abstraction layer (`src/lib/auth/`) isolates the auth provider — only one file imports Better Auth directly, enabling future migration to AT Protocol.

**Data model**: Users have platform-agnostic UUIDs (not Convex internal IDs) for portability. Each user gets an auto-created personal canvas on signup.

**WebRTC**: Native RTCPeerConnection data channels for real-time cursor presence and drag streaming between peers. Signaling via Convex (no extra infrastructure). Graceful degradation — if WebRTC fails, the app falls back to Convex-only behavior.

## Features

### Canvas Objects
- **Notes** — Rich text sticky notes with Tiptap inline editing, 5 color swatches, bold/italic/headings/lists, 8-direction free resize, auto-expanding height
- **Beacons** — Living broadcast signals for spontaneous or planned events. Halftone dot display (sprite-based, inspired by ASCII/dither art), ripple emanation, cascading heartbeat pulse, signal dot antenna, layered ambient glow. Natural language time input ("in 30 min", "tomorrow at 3pm"). AI-assisted activity suggestions powered by Claude Opus 4.6.
- **Photos** — Polaroid-style cards with white frame, random tilt, drop shadow. Upload via Convex file storage with server-side MIME validation. Editable captions.
- **Music** — Dark card objects with oEmbed metadata (Spotify, YouTube, YouTube Music, Apple Music). Thumbnail, title, artist, platform badge. Play-on-card with morph embeds. Draggable iframe overlay that tracks pan/zoom.

### Social
- **Friend codes** — Add friends by sharing unique codes
- **Shared canvases** — RBAC access control (viewer < member < owner)
- **Direct beacons** — Send event invitations directly to friends' personal canvases
- **Beacon responses** — Join, show interest, or decline
- **Sticker reactions** — Emoji reactions attached to any canvas object (move with the object)
- **Cursor presence** — See friends' cursors in real-time via WebRTC

### Design
- Deep space background (`0x0a0a1a`) with parallax star field (3 layers + twinkle)
- Warm parchment canvas (`0xe8e0d4`) with rounded corners
- Dark glass UI panels with backdrop blur and Satoshi font
- Animated floating toolbar with GSAP spring physics
- Dynamic min zoom (75% viewport fill), auto-center on load

## Security

Three full audit passes completed. Every Convex mutation validates:

- **Authentication** — `getAuthenticatedUser()` verifies auth token
- **Authorization** — `checkCanvasAccess()` enforces RBAC (viewer < member < owner)
- **Input bounds** — Positions within canvas (0-3000, 0-2000), string lengths capped, file types validated server-side
- **Rate limits** — Max 10 direct beacons per user per hour, max 50 recipients per beacon, max 5 stickers per user per object, max 20 friend requests per hour, max 200 objects per canvas
- **Time validation** — Beacon start not in past (1min grace), max 90-day duration
- **Cascade deletes** — Removing objects cleans up associated responses and stickers
- **CSP headers** — Hardened with `base-uri`, `form-action`, `frame-ancestors`, Convex domains whitelisted

## Security Roadmap

Authentication currently uses username/password via Better Auth. The auth layer is abstracted behind a single service file, designed for easy migration.

**Next step: Passkeys.** Passwordless, phishing-resistant authentication using device biometrics (Face ID, Touch ID, Windows Hello). No passwords to steal, no emails to leak. This aligns with the app's privacy-first philosophy and the eventual move to AT Protocol's decentralized identity (DIDs).

## Future: Privacy, Security & Encryption

Orbyt is built on the belief that social platforms should respect user privacy, give people ownership of their data, and never exploit attention for profit. Here's where we're headed.

### AT Protocol Integration

We've researched the [AT Protocol](https://atproto.com/) (the decentralized social protocol behind Bluesky) as a long-term foundation for Orbyt. The protocol's values — user data ownership, account portability, no platform lock-in — align directly with ours.

**What fits well:**
- **Decentralized identity (DIDs)** replace usernames with portable, cryptographic identifiers. Users could sign in with their Bluesky handle or any AT Protocol identity — no passwords to manage, no vendor lock-in.
- **User-owned data repositories** mean your canvas objects, beacons, and social connections belong to you, not to us. If Orbyt ever shuts down, your data lives on.
- **Custom Lexicon schemas** (`com.orbyt.*`) would let us define canvas-native record types that other apps could read and interoperate with.
- **Our auth abstraction layer** (`src/lib/auth/`) was designed from day one for this migration — only a single file needs to change.

**What doesn't fit yet:**
- **All AT Protocol data is currently public.** There is no private data support. This is a dealbreaker for personal canvases, shared canvas RBAC, and direct beacons. A [Private Data Working Group](https://github.com/bluesky-social/atproto/discussions/3363) exists but has no shipping timeline.
- **Real-time collaboration needs aren't served.** AT Protocol is publish/subscribe, not real-time. WebRTC cursor presence (20Hz), drag streaming (25Hz), and canvas presence heartbeats require infrastructure the protocol doesn't provide. Convex (or similar) stays for this.
- **Schema immutability.** Published Lexicon schemas can never have breaking changes — only additive optional fields. For a project still iterating, this demands careful upfront design.

**Our plan is a phased hybrid approach:**
1. **Now** — Ship on Better Auth + Convex. Focus on the product, not the protocol.
2. **Next** — Add AT Protocol OAuth as a sign-in option. Users authenticate with their DID; we map it to our existing UUID system. One new method in `authService.ts`.
3. **When private data ships** — Gradually move public data to user repos. Canvases and social graph become portable. Convex remains the real-time engine.
4. **Long-term** — Full federation. Users host their own data. Our AppView indexes the network. True data sovereignty.

### Encryption

Privacy isn't just about access control — it's about who can read the data at all.

**Current state:** Data at rest is protected by Convex's infrastructure. Data in transit is encrypted via TLS (HTTPS/WSS). WebRTC data channels use DTLS encryption by default. But the platform operator (us) can read user data server-side.

**Where we want to go:**
- **End-to-end encrypted canvases.** Canvas content encrypted client-side before it reaches the server. Only users with the canvas key can decrypt. The server stores ciphertext it can't read.
- **Forward secrecy for direct beacons.** Direct beacons between friends should be encrypted such that compromising a key today doesn't expose past messages.
- **Zero-knowledge social graph.** Friendship relationships stored as encrypted references. The server facilitates connections without knowing who is friends with whom.

These are hard problems — key distribution, group key management, and encrypted search all have active research communities. We're watching projects like [MLS (Messaging Layer Security)](https://www.rfc-editor.org/rfc/rfc9420.html) and the AT Protocol Private Data Working Group for standards to build on rather than inventing our own crypto.

### Principles

No matter what protocols or encryption schemes we adopt, these principles don't change:

- **No email required.** Identity shouldn't depend on a corporate email provider.
- **No tracking.** No analytics, no fingerprinting, no ad networks.
- **No dark patterns.** The app is designed to be closed, not kept open.
- **Data portability.** Users should be able to leave and take everything with them.
- **Transparency.** The code is open source (AGPL-3.0). The roadmap is public. Trust is earned, not assumed.

## Business Model

Orbyt will never run ads, sell data, or exploit attention. The platform is funded entirely by voluntary donations — inspired by [Wikipedia](https://wikimediafoundation.org/) and [Signal](https://signal.org/). Users can donate any amount monthly or whenever they choose.

**Where donations go:**
1. **Keep Orbyt running** — hosting, infrastructure, development. We publish exactly what this costs.
2. **Give back** — surplus funds go to charities and organizations, with a focus on:
   - **Protecting people affected by AI** — creative workers, displaced communities, those facing algorithmic bias
   - **AI for good** — medical research, environmental science, public policy
   - **Digital rights** — privacy, encryption, open internet advocacy

We're evaluating [Open Collective](https://opencollective.com/) for transparent financial reporting alongside direct donations, so every dollar in and out is publicly visible.

## Project Status

- **Layer 1** — Canvas foundation (pan/zoom with momentum + rubber-band edges, drag-drop, TextBlock objects)
- **Layer 2** — Backend + auth + persistence (Convex, Better Auth, real-time sync, auth abstraction)
- **Layer 3** — Social layer (friend codes, friendships, shared canvases, beacons, responses, sticker reactions, direct beacons, expiration cron)
- **WebRTC** — Real-time cursor presence and drag streaming via native RTCPeerConnection data channels
- **Rich text** — Tiptap inline editor with HTMLText rendering, formatting toolbar, color picker
- **Photos** — Polaroid-style photo objects with Convex file storage
- **Music** — Dark card objects with play-on-card, morph embeds, platform detection (Spotify, YouTube, Apple Music)
- **Visual redesign** — "Cozy Campfire in Space" — dark glass UI, parallax stars, animated toolbar, Satoshi font
- **Living beacons** — Halftone dot display, ripple emanation, cascading heartbeat, signal dot antenna
- **Performance** — cacheAsTexture, boundsArea, GSAP lagSmoothing (0.1ms median frame time)
- **Security** — Three audit passes, RBAC on all mutations, input validation, rate limits, CSP hardening, cascade deletes
- **In progress** — Landing page (orbyt.life), AI-assisted beacon creation, deployment
- **Next** — Rive animations, mobile app (Friendship Health dashboard)

## License

Open source — [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You're free to view, use, modify, and distribute this code. If you run a modified version as a network service, you must make your source code available under the same license. This protects the project's privacy-first philosophy while keeping everything transparent and open.
