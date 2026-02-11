# Astrophage — Claude Code Prompt

## Project Vision

Astrophage is a non-addictive social connection platform that prioritizes real-life human relationships over engagement metrics. Named after the organism in Project Hail Mary that was simultaneously a threat and a bridge between worlds — just like social technology can either isolate us or genuinely connect us — Astrophage is designed to be the version that connects.

The core philosophy: open the app, see the people who matter to you, make plans to be together in real life, and close the app. No scrolling. No algorithms. No advertisements. No engagement tricks. The app is a launchpad for real life, not a replacement for it.

This is a passion project intended to grow organically. The business model is donation-based like Wikipedia and Signal, with full financial transparency. No ads, no data selling, no AI-generated content or algorithmic feeds.

---

## Tech Stack

- **Frontend Framework:** SvelteKit (with TypeScript)
- **Canvas/Rendering Engine:** PixiJS (WebGL-powered 2D rendering)
- **Backend/Database:** Convex (reactive backend with real-time sync)
- **Styling:** Tailwind CSS (for non-canvas UI elements like navigation, modals, forms)
- **Animation (DOM/UI):** Motion (https://motion.dev/) — vanilla JavaScript API for all non-canvas animations (spring physics, layout transitions, enter/exit animations, gestures)
- **Animation (Canvas):** PixiJS built-in ticker + tween.js or GSAP for WebGL canvas object animations
- **Language:** TypeScript everywhere
- **Hosting:** Vercel (for SvelteKit frontend)
- **Future — Decentralized Identity:** AT Protocol (https://atproto.com/) for decentralized identity (DIDs), data portability, and user-owned data. Not implemented in MVP but the architecture must be designed to support it.

---

## AT Protocol Integration Plan (Future — Design For It Now)

Astrophage is philosophically aligned with the AT Protocol's vision of decentralization, user-owned identity, and data portability. The builder is committed to integrating AT Protocol but it should be phased in thoughtfully, not bolted on at the start alongside three other new technologies.

### Why AT Protocol matters for Astrophage
- **User-owned identity:** Users get a decentralized identifier (DID) — a cryptographic identity they own, not the platform. They can be `@joe.astrophage.social` or bring their own domain like `@joe.mydomain.com`. No email required.
- **Data portability:** If Astrophage ever shuts down or a user wants to leave, they take their data with them. This is the ultimate "power to the people" move and aligns with the donation-based, transparent business model.
- **No lock-in:** Users are never trapped. This builds trust and aligns with the philosophy of Signal, Proton, and Wikipedia.
- **Custom schemas (Lexicons):** Astrophage can define its own data types on the protocol — `social.astrophage.canvas`, `social.astrophage.beacon`, `social.astrophage.sticker` — so canvas objects, beacons, and reactions are first-class citizens in the decentralized network.

### Why NOT in the MVP
- AT Protocol's data repositories are currently public by default. Private data support is still under development. Since Astrophage is built entirely around private canvases and trusted circles, this is a blocker for full integration right now.
- The protocol is actively being standardized through the IETF (Internet Drafts published September 2025, working group charter January 2026). Building directly on a moving target adds risk.
- Learning SvelteKit + PixiJS + Convex simultaneously is already ambitious. Adding AT Protocol's DID system, PDS hosting, Lexicon schema definitions, and cryptographic signing on top would slow down the MVP significantly.

### Phased integration plan

**Phase 1 (MVP — now):** Build on Convex auth. But keep the user identity model clean and abstracted. Do NOT deeply couple Convex-specific auth into every component. Create an identity abstraction layer (e.g., a `currentUser` store/context that other components consume) so swapping the auth backend later doesn't require rewriting the whole app. Allow signup with just a username — no email required if possible.

**Phase 2 (Post-MVP):** Introduce AT Protocol for identity only. Users authenticate with a DID (AT Protocol decentralized identifier) while canvas and beacon data still lives in Convex. This gives decentralized identity without rearchitecting the data layer. Users could use their existing Bluesky DID or create a new one through Astrophage.

**Phase 3 (When atproto private data ships):** Evaluate migrating canvas and beacon data into user repositories on Personal Data Servers (PDS). Define custom Lexicons for Astrophage's data types. At this point, users truly own all their social data in their own PDS — the full decentralized vision realized.

### Architectural decisions to make NOW to support AT Protocol later
1. **Abstract the auth layer.** Create an `AuthProvider` or identity service that the rest of the app consumes. Components should never directly call Convex auth — they should call the abstraction.
2. **Use portable user IDs internally.** Don't use Convex's internal user IDs as the canonical identifier throughout the app. Instead, generate a platform-agnostic user ID (like a UUID) that maps to whatever auth system is active. This makes migrating to DIDs much easier.
3. **Keep the data model DID-friendly.** AT Protocol uses content-addressed, signed data repositories. Design canvas objects and beacons so they could theoretically be serialized into atproto records. This mostly means keeping objects self-contained (no circular references, no deeply nested platform-specific IDs).
4. **No email dependency.** Support signup flows that don't require email. Username + password or passkey-based auth for MVP. This aligns with both the privacy philosophy and the eventual DID-based identity.

---

## Core Concepts

### Everything is a Canvas

The entire application is built around the metaphor of a canvas — a bounded, pannable 2D space where users place and arrange content. There are no feeds, no infinite scroll, no algorithmic timelines.

**Canvas types:**

1. **Personal Canvas (Private):** The user's home space. Only they can see it. They save whatever they want here — photos, videos, articles, links, notes, quotes. Think of it like MyMind meets a personal whiteboard. This is their private collection space.

2. **Shared Canvases (User-Created):** The user creates canvases and invites specific people. Examples:
   - A canvas shared with immediate family
   - A canvas for a close friend group
   - A canvas for a wider circle of friends
   - A canvas visible to anyone who visits their profile (public)

3. **Club/Organization Canvases (Future Feature):** Public-facing canvases for run clubs, book clubs, community organizations. Deprioritize for MVP.

**Canvas properties:**
- Bounded area (not infinite — this is intentional to create creative constraint, like a postcard or fridge)
- Pannable within bounds (no scrolling — panning feels like looking around a space)
- Users can place objects on the canvas: images, text blocks, links, shapes, drawings, sticker reactions, and beacon/event objects
- Content on shared canvases is visible to everyone with access
- The creator of the canvas controls who has access via direct invites
- Content lifespan is controlled by the creator of the content (they choose how long it stays visible — no platform-enforced ephemeral rules)

### Beacons (The Killer Feature)

Beacons are the spontaneous and planned event system. They are objects that can be placed on canvases and/or pushed directly to specific people.

**Beacon properties:**
- Title/description (free text)
- Location (manually entered address — NO GPS, no live location sharing)
- Time window (start time, end time — set by creator)
- Visibility scope: either specific named people OR everyone on a specific canvas
- Join/Interested mechanic (people can tap "I'm in")
- Visibility of who has joined (other people can see who's going, which creates organic momentum)
- Ephemeral by nature — the beacon disappears after the time window passes

**Beacon behavior:**
- **Spontaneous beacon (private):** "I'm at Blue Bottle Coffee until 3pm, come hang out." Sent to specific people (e.g., Ryan, Xander, Rocko). They get a notification and the beacon appears as an object on their personal canvas.
- **Open beacon (shared canvas):** "I'm working from WeWork Irvine this afternoon, anyone welcome to join." Posted on a shared friends canvas. Everyone with access sees it. When someone joins, others see the social proof and may join too.
- **Planned event (shared canvas):** "Street food market in LA next Saturday, who's in?" Posted on a shared canvas with join/interested RSVP. Simpler than Partiful — not trying to compete with full event platforms.

### Bubbles (Mobile-First People View)

On mobile, the primary view is NOT a canvas but a bubble interface — floating circles representing each person connected to a specific canvas group. This is the entry point.

**Bubble properties:**
- Each bubble shows the person's face/avatar
- Bubbles with recent canvas updates glow or highlight subtly (not ranked, not ordered by algorithm — just gently indicating newness)
- A small icon/emoji on or near a bubble indicates the type of update: a beacon pin for events, a camera icon for new photos, a text icon for new writing, etc.
- Tapping a bubble can either go directly to a beacon (if that's the active update) or to that person's shared canvas
- The bubble view has a toolbar/nav at the top to switch between canvas groups (family, friends, a specific group, etc.)
- NO feed. NO scroll. You see people, not content. You choose who to visit.

### Sticker Reactions (Not Likes)

There are no likes, no comment counts, no engagement metrics visible to the user.

- Users can leave sticker reactions on objects within shared canvases (similar to FigJam stickers)
- Stickers are expressive and fun, not quantified
- There is no count displayed — you see the stickers themselves, not a number
- This removes the performative pressure of "how many likes did I get"

### No Messaging (Intentional)

Astrophage does NOT include a built-in messaging system for MVP. The philosophy is that if you want to message someone, you already have their number, iMessage, Signal, etc. Astrophage is not trying to replace direct communication tools — it's the layer above that helps you discover *reasons* to connect, not the connection medium itself.

---

## Animation Architecture (Two Layers)

Astrophage should feel buttery smooth and alive — like Figma-level polish. Animations are critical to making the app feel warm, responsive, and delightful without being addictive or distracting. There are two distinct animation layers that use different technologies.

### Layer 1: DOM/UI Animations — Motion (https://motion.dev/)

Motion (formerly Framer Motion) handles ALL animations outside the PixiJS canvas. Since Astrophage uses SvelteKit (not React), use Motion's **vanilla JavaScript API** — import `animate`, `spring`, `stagger`, `inView`, etc. from `motion`. In Svelte, grab element references with `bind:this` and call Motion's animate functions directly.

Install: `npm install motion`

**Where to use Motion:**

| UI Element | Animation Type | Motion Feature |
|---|---|---|
| Bubbles floating, pulsing, glowing | Continuous subtle animation | `animate` with spring physics, `repeat: Infinity` |
| Bubble highlighting on new updates | State transition | `animate` with spring easing |
| Beacon cards appearing | Enter animation | `animate` with `opacity`, `scale`, `y` |
| Beacon cards expiring/disappearing | Exit animation | `animate` to fade/scale out, then remove DOM element |
| Navigation/page transitions | Layout transition | `animate` or SvelteKit page transitions |
| Toolbar hover states | Gesture response | `animate` on mouseenter/mouseleave |
| "I'm in" button response | Tap feedback | `animate` with spring scale bounce |
| Attendee list updating | Layout shift | `animate` with stagger for sequential reveals |
| "You're all caught up" moment | Celebratory reveal | `animate` with spring + stagger |
| Canvas group switcher | Tab transition | `animate` with crossfade |

**Animation principles to enforce:**
- **Spring physics over linear easing.** Springs feel natural and alive. Use Motion's spring defaults as the baseline for most transitions.
- **Subtle, not flashy.** Animations should feel like breathing — gentle, organic, barely noticed but deeply felt. Nothing should scream for attention.
- **Fast response, gentle settle.** Interactions should feel instant (low stiffness springs or short durations) but settle softly (moderate damping).
- **No animation should delay the user.** If someone wants to tap a bubble and see a canvas, the transition should be near-instant. Beauty never blocks function.

**Example pattern for Svelte + Motion:**
```svelte
<script>
  import { animate, spring } from "motion"

  let bubbleEl

  function onBubbleHover() {
    animate(bubbleEl, { scale: 1.08 }, { type: spring, stiffness: 400, damping: 25 })
  }

  function onBubbleLeave() {
    animate(bubbleEl, { scale: 1 }, { type: spring, stiffness: 300, damping: 30 })
  }
</script>

<div bind:this={bubbleEl} on:mouseenter={onBubbleHover} on:mouseleave={onBubbleLeave}>
  <!-- bubble content -->
</div>
```

### Layer 2: Canvas/WebGL Animations — PixiJS Built-in + Tweening

Motion CANNOT animate inside the PixiJS WebGL canvas. For canvas object animations, use PixiJS's built-in `app.ticker` for frame-by-frame updates and a lightweight tweening library for smooth value transitions.

Recommended: **tween.js** (`npm install @tweenjs/tween.js`) — lightweight, framework-agnostic, works perfectly with PixiJS. Alternative: **GSAP** with PixiJS plugin for more complex timeline sequences.

**Where to use PixiJS/tween animations:**

| Canvas Element | Animation Type | Approach |
|---|---|---|
| Pan and zoom | Smooth camera movement | PixiJS container transform + tween for momentum |
| Dragging objects | Real-time position update | PixiJS interaction events, direct position setting |
| Object placement (new item appears) | Pop-in / scale up | tween.js: scale 0 → 1 with easeOutBack |
| Content fading (approaching expiry) | Gradual opacity reduction | tween.js: alpha 1 → 0 over time |
| Beacon pulse on canvas | Repeating glow effect | PixiJS ticker: oscillate scale/alpha with sine wave |
| Sticker reaction pop-in | Bouncy entrance | tween.js: scale 0 → 1.2 → 1 with elastic easing |
| Canvas bounds edge resistance | Rubber-band effect on pan | PixiJS ticker: spring-back calculation on bounds collision |
| Photo roll interaction | Smooth card flip/slide | tween.js: position/rotation interpolation |

**Canvas animation principles:**
- **60fps minimum.** PixiJS renders on WebGL — leverage the GPU. Never block the render loop with heavy calculations.
- **Momentum and inertia.** When the user stops panning, the canvas should drift to a stop, not freeze. Calculate velocity and apply deceleration.
- **Consistent physics.** Canvas object animations should feel like they exist in the same physical space — same gravity, same spring constants, same friction.

---

## Data Model (Convex Schema)

Design the Convex schema to support the following entities and relationships:

### Users
- id (platform-agnostic UUID — NOT Convex's internal ID. This is the canonical identifier used throughout the app to enable future migration to AT Protocol DIDs)
- convex_auth_id (maps to Convex auth — this is the only place Convex auth is directly referenced)
- future: did (AT Protocol decentralized identifier — added in Phase 5)
- username (unique, required — primary login identifier)
- display_name
- avatar_url
- email (optional — never required. Privacy-first.)
- created_at, updated_at

### Canvases
- id, owner_id (references users), name, type (personal | shared | public)
- bounds (width, height — the bounded canvas area)
- created_at, updated_at

### Canvas Access (many-to-many)
- canvas_id, user_id, role (owner | member | viewer)
- invited_at, invited_by

### Canvas Objects
- id, canvas_id, creator_id
- type (image | text | link | shape | drawing | beacon | photo_roll | sticker)
- position (x, y coordinates on canvas)
- size (width, height)
- content (JSON blob — flexible per object type)
- expires_at (nullable — creator-controlled lifespan)
- created_at, updated_at

### Beacons (specialized canvas object with additional fields)
- id, creator_id, canvas_id (nullable — can exist without being on a canvas)
- title, description
- location_address (text — manually entered, no GPS)
- start_time, end_time
- visibility_type (direct | canvas)
- direct_recipients (array of user_ids — for private beacons)
- created_at

### Beacon Responses
- beacon_id, user_id, status (joining | interested | declined)
- responded_at

### Sticker Reactions
- id, object_id, user_id, sticker_type
- position (x, y — where on the object the sticker is placed)
- created_at

---

## MVP Scope — What to Build First

Build these features in this priority order:

### Phase 1: Foundation
1. User authentication (Convex auth — username-based, no email required if possible). IMPORTANT: Build an auth abstraction layer (`AuthProvider` / `currentUser` store) so the rest of the app never directly calls Convex auth. This enables swapping to AT Protocol DIDs later.
2. Generate a platform-agnostic user ID (UUID) that maps to the Convex auth user. Use this UUID as the canonical user identifier throughout the app, NOT Convex's internal IDs.
3. Personal canvas — a bounded PixiJS canvas where the user can place text blocks and images
4. Canvas object CRUD — add, move, resize, delete objects on the canvas
5. Save canvas state to Convex in real-time

### Phase 2: Sharing
5. Create a shared canvas and invite other users by username/email
6. Access control — only invited users can view a shared canvas
7. Real-time sync — when someone places an object on a shared canvas, others see it appear live (Convex reactivity)

### Phase 3: Beacons
8. Create a beacon object (title, location, time window, description)
9. Place a beacon on a shared canvas (visible to all members)
10. Send a beacon directly to specific users (notification + appears on their personal canvas)
11. Join/interested response mechanic
12. Beacon expiration — auto-remove after time window passes

### Phase 4: Mobile Bubbles View
13. Responsive bubble interface for mobile viewports
14. Bubbles represent connected users with subtle update indicators
15. Tap bubble to view beacon or visit their shared canvas

### Phase 5: AT Protocol Integration (Future)
16. Integrate AT Protocol for decentralized identity (DIDs) — users authenticate via DID instead of Convex auth
17. Define custom Lexicons for Astrophage data types (canvases, beacons, stickers)
18. Evaluate migrating user data to Personal Data Servers (PDS) once atproto private data support ships
19. See the "AT Protocol Integration Plan" section above for full details

---

## Design Principles (Enforce These)

1. **No infinite scroll.** Content exists in bounded spaces. Period.
2. **No algorithmic ranking.** Nothing is sorted by engagement, popularity, or "relevance." Content is arranged spatially by the creator or chronologically.
3. **No like counts.** Sticker reactions only. No numbers displayed.
4. **No advertisements.** Ever.
5. **No AI-generated content or algorithmic feeds.** The platform is human-first.
6. **No GPS or live location.** Events have manually entered addresses.
7. **Creator controls content lifespan.** The user decides how long their content stays up.
8. **Minimal notifications.** Only beacon invitations sent to you directly should push a notification. Canvas updates are discovered when you open the app. No notification badges showing counts.
9. **Finite, bounded spaces.** Canvases have edges. This is a feature, not a limitation.
10. **Encourage closing the app.** The design should make it easy to see what matters and leave. Consider a "you're all caught up" state.
11. **Identity portability by design.** The user's identity belongs to them, not the platform. Abstract auth so migration to AT Protocol DIDs is seamless. Never require email — support username-only or passkey auth.
12. **Data portability by design.** Design canvas objects and beacons as self-contained, serializable records. No deeply coupled platform-specific IDs. Users should eventually be able to export everything they've created.

---

## File Structure

```
astrophage/
├── src/
│   ├── routes/              # SvelteKit routes
│   │   ├── +page.svelte     # Landing / home (bubbles view or canvas)
│   │   ├── +layout.svelte   # Root layout
│   │   ├── canvas/
│   │   │   ├── [id]/+page.svelte  # Individual canvas view
│   │   ├── auth/
│   │   │   ├── login/+page.svelte
│   │   │   ├── signup/+page.svelte
│   │   ├── beacon/
│   │   │   ├── create/+page.svelte
│   ├── lib/
│   │   ├── canvas/           # PixiJS canvas engine
│   │   │   ├── CanvasRenderer.ts      # Main PixiJS application setup
│   │   │   ├── objects/               # Canvas object types
│   │   │   │   ├── TextBlock.ts
│   │   │   │   ├── ImageObject.ts
│   │   │   │   ├── BeaconObject.ts
│   │   │   │   ├── StickerReaction.ts
│   │   │   ├── interactions/          # Pan, zoom, drag, select
│   │   │   │   ├── PanZoom.ts
│   │   │   │   ├── DragDrop.ts
│   │   │   │   ├── ObjectSelect.ts
│   │   ├── components/       # Svelte UI components (non-canvas)
│   │   │   ├── BubbleView.svelte
│   │   │   ├── BeaconCard.svelte
│   │   │   ├── CanvasToolbar.svelte
│   │   │   ├── Navigation.svelte
│   │   ├── stores/           # Svelte stores for state
│   │   ├── auth/             # Auth abstraction layer (DO NOT couple Convex auth directly into components)
│   │   │   ├── AuthProvider.svelte   # Wraps auth logic, provides currentUser store
│   │   │   ├── authService.ts        # Auth interface — swap implementation for AT Protocol later
│   │   ├── animations/       # Shared animation presets and utilities
│   │   │   ├── springs.ts            # Reusable spring configs (e.g., bubbleSpring, cardSpring)
│   │   │   ├── transitions.ts        # Common Motion animate patterns (fadeIn, scaleIn, slideUp)
│   │   │   ├── canvasTweens.ts       # PixiJS tween.js presets for canvas object animations
│   │   ├── utils/            # Helpers
│   ├── app.html
│   ├── app.css               # Tailwind setup
├── convex/
│   ├── schema.ts             # Convex database schema
│   ├── users.ts              # User queries and mutations
│   ├── canvases.ts           # Canvas CRUD
│   ├── objects.ts            # Canvas object CRUD
│   ├── beacons.ts            # Beacon CRUD and responses
│   ├── access.ts             # Canvas access control
├── static/                   # Static assets
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
```

---

## Getting Started Commands

```bash
# Create SvelteKit project
npx sv create astrophage
# Select: SvelteKit minimal, TypeScript, Tailwind CSS

# Navigate to project
cd astrophage

# Install PixiJS
npm install pixi.js

# Install Motion (vanilla JS API — used for all DOM/UI animations)
npm install motion

# Install tween.js (used for PixiJS canvas object animations)
npm install @tweenjs/tween.js

# Install Convex
npm install convex
npx convex dev  # Initialize Convex project and start dev server

# Run dev server
npm run dev
```

---

## Important Context

- This is a passion project, not a startup. Growth is organic.
- The builder (Joe) is experienced with React and Remix, learning SvelteKit, PixiJS, and Convex for the first time.
- Prioritize clear, well-commented code and simple patterns over clever abstractions.
- When in doubt, keep it simple. This MVP is about proving the core loop: personal canvas → shared canvas → beacon → real-life hangout.
- The name "Astrophage" comes from Project Hail Mary by Andy Weir. The organism that was both a threat and the fuel that brought two beings together across the cosmos.
- AT Protocol (https://atproto.com/) integration is planned for post-MVP. For now, design with identity portability and data portability in mind. Abstract auth behind an `AuthProvider`. Use platform-agnostic UUIDs as user identifiers. Keep canvas objects and beacons self-contained and serializable. Never require email for signup.
- Joe is passionate about privacy and decentralization. He is inspired by Signal, Proton, Kagi, and Wikipedia. The platform should never collect more data than necessary and users should always own what they create.
