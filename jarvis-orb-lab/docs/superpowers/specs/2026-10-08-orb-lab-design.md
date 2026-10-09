# Jarvis Orb Lab — Design Specification
Date: 2026-10-08
Status: Proposed for review
Branch: experiment/orb-lab

## Purpose and acceptance criteria
Create an isolated, browser-based visual laboratory comparing (A) a faithful SmoothUI-inspired expressive AI Orb Face and (B) a cinematic WebGL intelligence orb. Both render the same normalized, factual Jarvis/Hermes state. No changes to Jarvis main, bridge security, or production UI. The laboratory must remain usable in DEMO without Hermes.

## Scope and decomposition
Phase 1: Standalone React + TypeScript + Vite application under experiments/orb-lab, shared state contract, SVG Classic renderer, controls and deterministic demo/replay, tests.
Phase 2: Three.js cinematic renderer, nine composited visual layers, performance scaling, reduced-motion behavior, mobile layout.
Phase 3: Read-only LIVE adapter to existing Jarvis Event Bus via an explicitly authorized local bridge. Do not expose bridge tokens, create command endpoints, or silently add new cross-origin permissions. Separate review and security tests before enabling LIVE.
Out of scope: agent execution, modifying production Orb, background autonomous tasks, external cloud deployment with local secrets.

## Architecture
Input adapters (DemoAdapter, ReplayAdapter, LiveAdapter) -> EventNormalizer -> OrbStateMachine -> MotionDirector -> two renderers (ClassicFaceRenderer, CinematicOrbRenderer). Studio UI owns playback and quality controls; renderers never subscribe to raw Hermes transport or execute commands.
Classic uses React, SVG, Motion springs and accessible textual status. Cinematic uses Three.js / React Three Fiber, GLSL shaders, and selectively enabled postprocessing. Animation updates use refs, MotionValues and frame callbacks, not React state at audio frame rate.
One authoritative state snapshot feeds both renderers; a sync toggle can temporarily freeze one renderer for comparison, never alter source truth.

## State model
Normalized states: idle, listening, thinking, streaming, executing, approval_required, paused, recovering, verifying, done, error. Fields: state, taskId, source, eventId, timestamp, activity, amplitude, optional toolName, replay, connectionStatus.
Map J.engine.mode IDLE/LISTENING/THINKING/EXECUTING/APPROVAL_REQUIRED/PAUSED/RECOVERING/VERIFYING/COMPLETED/ERROR to normalized states. Streaming requires a real stream-start or content event; do not infer streaming solely from THINKING. Completion and errors are based on task.completed/task.failed, not tool outcomes alone. Do not invent tool calls.
J.ev.on('*', handler) is the source for in-page integrations; an external lab must not assume this JavaScript object is accessible across origins. The live bridge contract is deliberately deferred to Phase 3 review.
Events are deduplicated by eventId and taskId where applicable. Out-of-order events cannot replace a newer task. Connection loss shows disconnected without fabricating an error task. Error visual stays until authoritative state changes. Replay is visibly labeled and cannot emit back into production.

## Visual design
Classic: friendly pastel/lavender sphere, two independent capsule eyes, spring gaze, randomized natural blink, thinking saccades, attentive widening, focused squint, content arcs and squash/stretch hop, dizzy spirals. Original SmoothUI code is a reference; review license and dependencies before copying. Source code has eyes only, no mouth.
Cinematic: (1) environment, (2) atmospheric halo, (3) orbital geometry, (4) glass shell/Fresnel, (5) procedural plasma core, (6) neural filaments, (7) particles, (8) expressive face, (9) bloom/post-processing. These layers respond coherently to the state, not random status effects. Presets: Quantum Glass, Neural Plasma, Holographic Energy.
State choreography: idle slow breathing; listening audio-reactive breathing; thinking saccades and filament activity; streaming restrained pulse; executing packet flow tied to actual tools; done ~850ms happy hop + outward energy wave; error ~1s wobble with persistent error expression; approval amber awaiting pulse; paused restrained motion; recovering soft stabilization; verifying focused scan.
Audio amplitude is normalized 0..1, clamped and smoothed. Demo slider is explicitly synthetic. No microphone access without user interaction and permission.

## Studio interface
Responsive split view for A/B, full-screen single renderer, showcase mode, state buttons, amplitude control, sync/freeze comparison, material and quality controls, timeline with factual events and labeled demo/replay entries. Small screens stack views. Text labels describe all states; controls are keyboard accessible.

## Performance and accessibility
Target smooth 60fps desktop / 30fps constrained devices (targets, not claims). Adaptive DPR, particle caps, pause rendering in hidden tabs, dispose GPU resources, respect prefers-reduced-motion by disabling gaze tracking, blink, saccades, wobble and hop while keeping instantaneous expression changes. Screen readers get aria-label and textual status. Respect contrast and non-color state indicators.

## Error handling and tests
Unit tests: mode normalization, event ordering/dedup, terminal state persistence, replay isolation, audio clamping, permission-safe adapter boundaries. Component tests: all expressions, aria-label, reduced motion, unmount timer cleanup. Browser smoke: demo A/B, state switch, responsive viewport, hidden tab, WebGL unavailable fallback, disconnect, reconnect and performance presets. Verify no writes or commands reach Jarvis during lab operation. Production files untouched.

## Implementation boundary
Only add files in experiments/orb-lab and this design spec on experiment/orb-lab. No package or deployment changes in main. No credentials stored in source. Written implementation plan and separate review required before implementing the application.
