# Jarvis Graph OS · Cinematic Galaxy

Standalone React + TypeScript + WebGL visualization. This experiment lives **only** in `graph-3d/` on `feat/jarvis-graph-3d`; the existing Jarvis OS `main` branch is not modified.

Inspired by official `vasturiano/3d-force-graph` examples: force-directed clusters, custom geometry, text sprites, directional particles and Bloom.

## Run

Requires Node.js 20.19+ (Node 24 recommended).

```bash
cd graph-3d
npm install
npm run dev
```

Open the Vite URL printed in the terminal.

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## Features

- `react-force-graph-3d` / Three.js / d3-force-3d
- Seeded **demo topology**: 6 semantic constellations, approximately 289 nodes and 400+ links at MED density
- Deterministic distribution with central Jarvis orb and pinned cluster hubs
- Stars, luminous spheres, ring geometry, text sprites, optional UnrealBloomPass
- Traffic particles on inter-cluster links; activity list clearly labeled **SIMULATED**
- Orbit and node camera focus (node/hub/whole universe)
- System, Agents, Projects, Memory, Live Flow views
- Search, density presets, connected-node inspector
- Mobile layout, reduced-motion initial defaults and WebGL fallback

## Controls

| Control | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom |
| Click a sphere or cluster in sidebar | Inspect + focus camera |
| Universe / Agents / Projects / Memory / Live Flow | Graph filtering |
| Orbit / Reset / Glow / Labels / Pause | Presentation controls |
| Low / Med / High | Change graph density |
| Ctrl+K or ⌘K | Focus search |
| Esc | Clear search and close mobile inspector |

## Reality boundary

The entire view is a **self-contained demo**, not a live connection to Hermes, Jev, Bridge or Obsidian. Data-flow entries are simulated. To connect real sources later, adapt the normalized shared graph/event contract described in:

- `docs/superpowers/specs/2026-10-08-jarvis-graph-3d-design.md`
- `docs/superpowers/plans/2026-10-08-jarvis-graph-3d.md`

Do not render G6 in the same WebGL canvas; it can be a later structured 2D/DAG companion.
