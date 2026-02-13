# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Astrophage is a non-addictive social connection platform. The entire UI is a PixiJS canvas — there are no traditional HTML pages or feeds. Users place objects on bounded canvases, create beacons (spontaneous/planned events), and connect in real life. Philosophy: open, see your people, make plans, close.

## Commands

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # Production build (use for quick validation)
npm run check        # Type check (svelte-kit sync + svelte-check)
npm run check:watch  # Type check with live reload
npx convex dev       # Convex dev server (run alongside Vite)
```

No test framework is configured yet.

## Tech Stack

- **SvelteKit** (Svelte 5 with `$props()` syntax) + TypeScript strict mode
- **PixiJS v8** — WebGL canvas rendering. Requires async `app.init()`.
- **Tailwind CSS v4** — Uses `@import "tailwindcss"` in app.css, `@tailwindcss/vite` plugin in vite.config.ts
- **Motion** — DOM/UI animations (vanilla JS API, not React). Use `animate`, `spring` from `motion`.
- **tween.js** — Canvas object animations inside PixiJS render loop
- **Convex** — Backend (database, real-time sync, serverless functions). Functions in `src/convex/`.
- **Better Auth** — Username/password authentication via `@convex-dev/better-auth` adapter

## Architecture

### Canvas is the app

The home page (`src/routes/+page.svelte`) mounts a full-screen PixiJS canvas. All user interaction happens on this canvas. The `CanvasRenderer` class (`src/lib/canvas/CanvasRenderer.ts`) owns the PixiJS `Application` and a `world` Container.

### World container pattern

Pan/zoom transforms the `world` container, not individual objects. Objects are children of `world` and move with it. The stage (root) is fixed; the world moves underneath it.

### Event conflict resolution

Object drag uses `event.stopPropagation()` so it doesn't trigger canvas pan. Drag on empty space bubbles to stage → pan fires. Drag on object → stops at object → only drag fires.

### Convex backend

Functions live in `src/convex/` (not project root) because SvelteKit can't import outside `src/`. Configured via `convex.json` at project root. The `$convex` path alias in `svelte.config.js` allows `import { api } from '$convex/_generated/api'`.

Environment variables are set on the Convex deployment via `npx convex env set KEY value`, accessed in Convex functions via `process.env.KEY` (requires `@types/node`).

### Auth flow

Better Auth handles username/password auth. The Convex adapter (`@convex-dev/better-auth`) stores auth data in Convex tables. The community SvelteKit adapter (`@mmailaender/convex-better-auth-svelte`) bridges auth with SvelteKit hooks and routing.

**Auth abstraction layer** (`src/lib/auth/`): Components never import Better Auth directly. Only `authService.ts` knows about Better Auth. When migrating to AT Protocol, only that file changes.

- `types.ts` — AuthUser, AuthState, SignUpParams, SignInParams interfaces
- `authService.ts` — signUp, signIn, signOut (ONLY file that imports Better Auth)
- `currentUser.svelte.ts` — Svelte 5 reactive store for auth state
- `index.ts` — barrel exports

**Auth token timing**: Convex queries run before the auth token is set on the client, so `getCurrentUser` briefly returns `null`. The page uses a two-phase approach: an `$effect` catches authenticated state instantly, with a 1500ms timeout fallback for genuinely logged-out users.

### Reactive data flow

User signs in → `getCurrentUser` returns auth user → `getByAuthAccount` finds Astrophage user → `getPersonalCanvas` finds their canvas → `getByCanvas` loads objects → `CanvasRenderer.syncObjects()` reconciles with PixiJS visuals. All queries are reactive via Convex WebSocket — changes propagate automatically across tabs.

### Key classes and files

| Class/File | Location | Responsibility |
|------------|----------|---------------|
| `CanvasRenderer` | `src/lib/canvas/CanvasRenderer.ts` | PixiJS app init, world container, object reconciliation (`syncObjects`) |
| `PanZoom` | `src/lib/canvas/interactions/PanZoom.ts` | Click-drag pan with momentum/inertia, scroll-wheel zoom, rubber-band edges |
| `DragDrop` | `src/lib/canvas/interactions/DragDrop.ts` | `makeDraggable(target, options)` — draggable with `onDragEnd` callback |
| `TextBlock` | `src/lib/canvas/objects/TextBlock.ts` | Sticky-note with rich text (HTMLText), 8-direction resize, auto-height |
| `BeaconObject` | `src/lib/canvas/objects/BeaconObject.ts` | Beacon with pulse animation, destroy() for tween cleanup |
| `PhotoObject` | `src/lib/canvas/objects/PhotoObject.ts` | Polaroid-style photo: white frame, tilt, shadow, center-cropped image |
| `StickerReaction` | `src/lib/canvas/objects/StickerReaction.ts` | Emoji sticker attached to parent object container |
| `PeerManager` | `src/lib/webrtc/PeerManager.ts` | WebRTC peer connections per canvas — cursor presence, drag streaming |
| `AuthModal` | `src/lib/components/AuthModal.svelte` | Sign up / sign in overlay on canvas |
| `CanvasToolbar` | `src/lib/components/CanvasToolbar.svelte` | Floating bar: Add Note/Beacon/Photo, sign out, username |
| `schema.ts` | `src/convex/schema.ts` | Database schema: 9 tables with compound indexes |
| `auth.ts` | `src/convex/auth.ts` | Better Auth factory + `getCurrentUser` query |
| `users.ts` | `src/convex/users.ts` | `createUser` (UUID + personal canvas), user queries, `getAuthenticatedUser` helper |
| `objects.ts` | `src/convex/objects.ts` | Canvas object CRUD with position/bounds validation |
| `photos.ts` | `src/convex/photos.ts` | Photo upload (generateUploadUrl, createPhoto, updateCaption) |
| `beacons.ts` | `src/convex/beacons.ts` | Beacon queries, direct beacons, expiration cleanup cron |
| `access.ts` | `src/convex/access.ts` | RBAC: checkCanvasAccess, grantAccess, revokeAccess, getAccessibleCanvases |

### Canvas dimensions

- World: 3000x2000px bounded area
- Zoom range: dynamic min (75% viewport fill) – 2.5x
- Background: deep space `0x0a0a1a`, parchment canvas `0xe8e0d4`, rounded corners
- 100px padding on bounds

### Security model

Every Convex mutation validates:
- **Authentication**: `getAuthenticatedUser()` — verifies auth token
- **Authorization**: `checkCanvasAccess(ctx, canvasId, userUuid, minRole)` — RBAC check (viewer < member < owner)
- **Input bounds**: Position within canvas (0–3000, 0–2000), string lengths capped, file types validated server-side
- **Rate/spam limits**: Max 50 direct beacon recipients, max 5 stickers per user per object, beacon duration max 90 days
- **CSP headers**: Configured in `src/hooks.server.ts` — `unsafe-inline`/`unsafe-eval` dev-only, Convex domains whitelisted

## Conventions

- **Classes**: PascalCase files matching class name (`CanvasRenderer.ts`)
- **Constants**: SCREAMING_SNAKE_CASE at module scope
- **Colors**: PixiJS hex format `0xRRGGBB`
- **Comments**: Explain "why", not "what". JSDoc on classes and public methods.
- **Composition over inheritance**: Objects built by combining PixiJS primitives (Container + Graphics + Text)
- **No separate auth pages**: Auth is a modal overlay on the canvas
- **Auth abstraction**: Components must never call Better Auth or Convex auth directly — use `$lib/auth`
- **Portable user IDs**: Use platform-agnostic UUIDs as canonical identifiers, not Convex `_id`
- **No email required**: Username-only signup. Placeholder email generated internally (`username@astrophage.local`).

## Design Principles (Non-Negotiable)

- No infinite scroll — bounded canvas spaces only
- No algorithmic ranking — spatial or chronological arrangement
- No like counts — sticker reactions only, no numbers
- No ads, no AI-generated content, no GPS/live location
- Creator controls content lifespan
- Design should encourage closing the app

## Current State

**Layer 1 complete**: SvelteKit scaffolded, PixiJS canvas rendering full-screen, pan/zoom with momentum and rubber-band edges, TextBlock objects with drag-and-drop.

**Layer 2 complete**: Convex backend live, Better Auth with username plugin, auth abstraction layer, auth modal overlay, user registration with UUID + auto personal canvas, canvas object persistence with real-time sync across tabs.

**Layer 3 complete**: Friend codes, friendships, shared canvases (RBAC), beacons with pulse animation, beacon responses, sticker reactions, expiration cron, direct beacons.

**WebRTC layer complete**: Native RTCPeerConnection data channels for cursor presence and drag streaming. Signaling via Convex. Graceful degradation to Convex-only on failure.

**Rich text + resize complete**: Tiptap inline editor with HTMLText rendering, 5 color swatches, bold/italic/headings/lists. 8-direction free resize on notes.

**Photos complete**: Polaroid-style photo objects with Convex file storage, upload flow, caption editing, delete actions.

**Security hardened**: Two full audit passes — RBAC on all mutations, input validation, indexed queries, server-side upload validation, spam prevention.

**Next**: Music link cards, Rive animations + polish, demo prep.
