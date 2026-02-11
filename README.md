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

- **SvelteKit** (Svelte 5) + TypeScript
- **PixiJS v8** — WebGL canvas rendering
- **Convex** — Real-time backend with WebSocket sync
- **Better Auth** — Username/password authentication
- **Tailwind CSS v4** — Styling for UI overlays
- **Motion** — DOM animations
- **tween.js** — Canvas animations

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

The canvas IS the app. There are no traditional HTML pages or route-based views. Everything renders on a PixiJS WebGL canvas with UI overlays (auth modal, toolbar) positioned on top.

**Canvas layer**: PixiJS Application with a world Container. Pan/zoom moves the world; objects are children of it. Drag-and-drop uses `stopPropagation()` to prevent conflicts with panning.

**Backend**: Convex provides the database, real-time subscriptions, and serverless functions. Canvas objects sync across tabs automatically via WebSocket.

**Auth**: Better Auth with a Convex adapter. An abstraction layer (`src/lib/auth/`) isolates the auth provider — only one file imports Better Auth directly, enabling future migration to AT Protocol.

**Data model**: Users have platform-agnostic UUIDs (not Convex internal IDs) for portability. Each user gets an auto-created personal canvas on signup.

## Project Status

- **Layer 1** — Canvas foundation (pan/zoom, drag-drop, TextBlock objects)
- **Layer 2** — Backend + auth + persistence (Convex, Better Auth, real-time sync)
- **Layer 3** — *(next)* Beacons, responses, sticker reactions

## License

Open source — MIT License.
