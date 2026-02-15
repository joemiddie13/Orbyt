# Astrophage

A non-addictive social connection platform. No feeds, no algorithms, no like counts. Just a canvas where you see your people, make plans, and close the app.

The entire UI is a PixiJS canvas — not a traditional web page. Users place objects on bounded canvases, create beacons (spontaneous or planned events), and connect in real life.

Built for the [**Built with Opus 4.6**](https://cerebralvalley.ai/e/claude-code-hackathon) hackathon, hosted by [Cerebral Valley](https://cerebralvalley.ai) & [Anthropic](https://anthropic.com). ([announcement](https://x.com/claudeai/status/2019833113418035237))

## Philosophy

- **Open, see your people, make plans, close.** The app is designed to encourage closing it.
- **No infinite scroll** — bounded canvas spaces only
- **No algorithmic ranking** — spatial or chronological arrangement
- **No like counts** — sticker reactions only, no numbers
- **No ads, no AI-generated content, no GPS/live location**
- **Creator controls content lifespan**
- **Privacy-first** — username-only signup, no email required

## Tech Stack

- **SvelteKit** (Svelte 5) + TypeScript strict mode
- **PixiJS v8** — WebGL canvas rendering
- **Convex** — Real-time backend with WebSocket sync
- **Better Auth** — Username/password authentication
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
- **Beacons** — Living broadcast signals for spontaneous or planned events. Halftone dot display (sprite-based, inspired by ASCII/dither art), ripple emanation, cascading heartbeat pulse, signal dot antenna, layered ambient glow. Natural language time input ("in 30 min", "tomorrow at 3pm")
- **Photos** — Polaroid-style cards with white frame, random tilt, drop shadow. Upload via Convex file storage with server-side MIME validation. Editable captions.

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
- **Rate limits** — Max 10 direct beacons per user per hour, max 50 recipients per beacon, max 5 stickers per user per object
- **Time validation** — Beacon start not in past (1min grace), max 90-day duration
- **Cascade deletes** — Removing objects cleans up associated responses and stickers
- **CSP headers** — Configured in hooks, Convex domains whitelisted

## Security Roadmap

Authentication currently uses username/password via Better Auth. The auth layer is abstracted behind a single service file, designed for easy migration.

**Next step: Passkeys.** Passwordless, phishing-resistant authentication using device biometrics (Face ID, Touch ID, Windows Hello). No passwords to steal, no emails to leak. This aligns with the app's privacy-first philosophy and the eventual move to AT Protocol's decentralized identity (DIDs).

## Project Status

- **Layer 1** — Canvas foundation (pan/zoom with momentum + rubber-band edges, drag-drop, TextBlock objects)
- **Layer 2** — Backend + auth + persistence (Convex, Better Auth, real-time sync, auth abstraction)
- **Layer 3** — Social layer (friend codes, friendships, shared canvases, beacons, responses, sticker reactions, direct beacons, expiration cron)
- **WebRTC** — Real-time cursor presence and drag streaming via native RTCPeerConnection data channels
- **Rich text** — Tiptap inline editor with HTMLText rendering, formatting toolbar, color picker
- **Photos** — Polaroid-style photo objects with Convex file storage
- **Visual redesign** — "Cozy Campfire in Space" — dark glass UI, parallax stars, animated toolbar, Satoshi font
- **Living beacons** — Halftone dot display, ripple emanation, cascading heartbeat, signal dot antenna
- **Performance** — cacheAsTexture, boundsArea, GSAP lagSmoothing (0.1ms median frame time)
- **Security** — Three audit passes, RBAC on all mutations, input validation, rate limits, cascade deletes
- **Next** — Music link cards, Rive animations, mobile app (Friendship Health dashboard), demo prep

## License

Open source — [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You're free to view, use, modify, and distribute this code. If you run a modified version as a network service, you must make your source code available under the same license. This protects the project's privacy-first philosophy while keeping everything transparent and open.
