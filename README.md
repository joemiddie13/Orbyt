# Orbyt

A non-addictive social connection platform. No feeds, no algorithms, no like counts. Just a canvas where you see your people, make plans, and close the app.

**[orbyt.life](https://orbyt.life)**

> Originally codenamed *Astrophage*, after the organism in [Project Hail Mary](https://en.wikipedia.org/wiki/Project_Hail_Mary) that was simultaneously a threat and a bridge between worlds — just like social technology can either isolate us or genuinely connect us.

<!-- TODO: Add screenshot/GIF of the canvas in action -->

## What is Orbyt?

Social media was supposed to connect us. Instead, it optimized for engagement — infinite feeds, algorithmic ranking, like counts, targeted ads — all designed to keep you scrolling, not connecting.

Orbyt is the opposite. The entire app is a canvas — a bounded, pannable space where you place things that matter and make plans with the people you care about. There are no feeds to scroll, no algorithms deciding what you see, no metrics measuring your worth.

The core loop is simple: **open the app, see your people, make plans to be together in real life, close the app.** The app is a launchpad for real life, not a replacement for it.

This is a passion project, not a startup. It grows organically. It's funded by donations, not ads. The code is open source. Your data belongs to you.

## Philosophy

- **Open, see your people, make plans, close.** The app is designed to encourage closing it.
- **No infinite scroll** — bounded canvas spaces only
- **No algorithmic ranking** — spatial or chronological arrangement
- **No like counts** — sticker reactions only, no numbers
- **No ads, no data harvesting, no GPS/live location**
- **Creator controls content lifespan**
- **Privacy-first** — username-only signup, no email required
- **Your data, your rules** — user-owned, never sold, never exploited

## Features

### Canvas Objects
- **Notes** — Rich text sticky notes with inline editing, 5 color swatches, bold/italic/headings/lists, 8-direction free resize
- **Beacons** — Living broadcast signals for events. Halftone dot display, ripple emanation, cascading heartbeat pulse. Natural language time input ("in 30 min", "tomorrow at 3pm"). AI-assisted activity suggestions powered by Claude.
- **Photos** — Polaroid-style cards with white frame, random tilt, drop shadow. Drag-and-drop from desktop or upload from toolbar. Editable captions.
- **Music** — Dark card objects with oEmbed metadata (Spotify, YouTube, YouTube Music, Apple Music). Play-on-card with morph embeds.

### Social
- **Friend codes** — Add friends by sharing unique codes
- **Shared canvases** — Role-based access control (viewer, member, owner)
- **Direct beacons** — Send event invitations directly to friends' personal canvases
- **Beacon responses** — Join, show interest, or decline
- **Sticker reactions** — Emoji reactions attached to any canvas object
- **Cursor presence** — See friends' cursors in real-time via WebRTC

### Design
- Deep space background with parallax star field (3 layers + twinkle)
- Warm parchment canvas with rounded corners
- Dark glass UI panels with backdrop blur
- Animated floating toolbar with spring physics
- Dynamic zoom, auto-center on load

## Roadmap

### Done

- **Canvas foundation** — PixiJS WebGL canvas, pan/zoom with momentum + rubber-band edges, drag-and-drop objects
- **Backend + auth** — Convex real-time database, Better Auth (username-only), auth abstraction layer for future migration
- **Social layer** — Friend codes, friendships, shared canvases with RBAC, sticker reactions
- **Beacons** — Spontaneous/planned events, direct beacons, responses, expiration cron
- **WebRTC** — Real-time cursor presence and drag streaming via native RTCPeerConnection data channels
- **Rich text** — Tiptap inline editor with HTMLText rendering, formatting toolbar, color picker
- **Photos** — Polaroid-style objects with Convex file storage, drag-and-drop upload, caption editing
- **Music** — Dark card objects with play-on-card morph embeds, platform detection
- **Visual redesign** — "Cozy Campfire in Space" theme, parallax stars, animated toolbar, dark glass UI
- **Living beacons** — Halftone dot display, ripple emanation, cascading heartbeat, signal dot antenna
- **Performance** — cacheAsTexture, boundsArea, GSAP lag smoothing
- **Security** — Multiple audit passes, RBAC on all mutations, input validation, rate limits, CSP hardening, cascade deletes

### In Progress

- **Landing page** — orbyt.life welcome experience
- **AI-assisted beacons** — Claude helps friends create beacons with activity suggestions based on location, interests, and time
- **Deployment** — Cloudflare Pages + Convex

### Next

- **Passkeys** — Passwordless authentication (Face ID, Touch ID, Windows Hello)
- **Rive animations** — Polish and delight across the canvas
- **Donation system** — Open Collective and/or Stripe for transparent funding
- **Mobile app** — "Friendship Health" dashboard inspired by Apple Fitness Rings. Each close friend gets a ring/meter representing hangout recency + frequency. Gamified but not addictive.

### Future

- **AT Protocol integration** — Decentralized identity (DIDs), user-owned data, account portability
- **End-to-end encryption** — Client-side encrypted canvases, zero-knowledge social graph
- **Full federation** — Users host their own data, true data sovereignty

See [Privacy & Decentralization Roadmap](docs/PRIVACY_ROADMAP.md) for details.

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
- **Claude** — AI-assisted beacon creation

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

The canvas IS the app. There are no traditional HTML pages or route-based views. Everything renders on a PixiJS WebGL canvas with UI overlays positioned on top.

**Canvas layer** — PixiJS Application with a world Container. Pan/zoom moves the world; objects are children of it. Drag-and-drop uses `stopPropagation()` to prevent conflicts with panning. Deep space background with parallax stars, warm parchment bounded canvas.

**Backend** — Convex provides the database (9 tables), real-time subscriptions, and serverless functions. Canvas objects sync across tabs automatically via WebSocket. Compound indexes eliminate post-filter scans.

**Auth** — Better Auth with a Convex adapter. An abstraction layer (`src/lib/auth/`) isolates the auth provider — only one file imports Better Auth directly, enabling future migration to AT Protocol.

**Data model** — Users have platform-agnostic UUIDs (not Convex internal IDs) for portability. Each user gets an auto-created personal canvas on signup.

**WebRTC** — Native RTCPeerConnection data channels for real-time cursor presence and drag streaming between peers. Signaling via Convex (no extra infrastructure). Graceful degradation — if WebRTC fails, the app falls back to Convex-only behavior.

### Key Files

| File | Responsibility |
|------|---------------|
| `src/routes/+page.svelte` | Home page — mounts canvas, wires up all interactions |
| `src/lib/canvas/CanvasRenderer.ts` | PixiJS app init, world container, object reconciliation |
| `src/lib/canvas/interactions/PanZoom.ts` | Pan with momentum/inertia, scroll-wheel zoom, rubber-band edges |
| `src/lib/canvas/interactions/DragDrop.ts` | Draggable objects with `onDragEnd` callback |
| `src/lib/canvas/objects/` | TextBlock, BeaconObject, PhotoObject, MusicObject, StickerReaction |
| `src/lib/webrtc/PeerManager.ts` | WebRTC peer connections per canvas |
| `src/lib/auth/` | Auth abstraction — components never import Better Auth directly |
| `src/convex/schema.ts` | Database schema: 9 tables with compound indexes |
| `src/convex/access.ts` | RBAC: checkCanvasAccess, grantAccess, revokeAccess |

## Security

Every Convex mutation validates:

- **Authentication** — `getAuthenticatedUser()` verifies auth token
- **Authorization** — `checkCanvasAccess()` enforces RBAC (viewer < member < owner)
- **Input bounds** — Positions within canvas (0-3000, 0-2000), string lengths capped, file types validated server-side
- **Rate limits** — Max direct beacons per hour, max recipients per beacon, max stickers per user per object, max friend requests per hour, max objects per canvas
- **Time validation** — Beacon start not in past (1min grace), max 90-day duration
- **Cascade deletes** — Removing objects cleans up associated responses and stickers
- **CSP headers** — Hardened with `base-uri`, `form-action`, `frame-ancestors`, Convex domains whitelisted

## Business Model

Orbyt will never run ads, sell data, or exploit attention. The platform is funded entirely by voluntary donations — inspired by [Wikipedia](https://wikimediafoundation.org/) and [Signal](https://signal.org/).

**Where donations go:**

1. **Keep Orbyt running** — hosting, infrastructure, development. We publish exactly what this costs.
2. **Give back** — surplus funds go to charities, with a focus on:
   - Protecting people affected by AI — creative workers, displaced communities, algorithmic bias
   - AI for good — medical research, environmental science, public policy
   - Digital rights — privacy, encryption, open internet advocacy

We're evaluating [Open Collective](https://opencollective.com/) for transparent financial reporting, so every dollar in and out is publicly visible.

## Contributing

Orbyt is open source and contributions are welcome. If you're interested in helping out:

- **Issues** — Bug reports, feature ideas, and questions are all welcome on [GitHub Issues](https://github.com/joemiddie13/Orbyt/issues)
- **Pull requests** — Fork the repo, make your changes, and open a PR
- **Discussion** — Have thoughts on the philosophy, roadmap, or design? Open an issue — we'd love to hear from you

## License

Open source — [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You're free to view, use, modify, and distribute this code. If you run a modified version as a network service, you must make your source code available under the same license. This protects the project's privacy-first philosophy while keeping everything transparent and open.
