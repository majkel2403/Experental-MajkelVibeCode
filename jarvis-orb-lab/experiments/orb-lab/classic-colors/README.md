# Classic Orb Color Lab

A standalone, dependency-free static HTML app containing twelve colorful expressive Orbs, six facial expressions, speed and four color controls per Orb, and browser-side export to SVG, PNG (512/1024/2048), HTML, ZIP.

## Vercel deployment

- Create a new Vercel project for this lab rather than modifying Jarvis production.
- Repository: `majkel2403/Jarvis-`
- Branch to deploy: `experiment/orb-lab`
- Root Directory: `experiments/orb-lab/classic-colors`
- Framework preset: Other; no build or install command required.
- Open deployed page and verify that SVG, PNG, HTML and ZIP export work in the browser.

This lab makes no calls to Hermes or the Jarvis bridge and contains no credentials. Its exports are generated locally in the user's browser; PNG is static, HTML and SVG can animate.

## Current availability

Source is committed on the isolated branch. Vercel remote deployment was attempted but blocked by a 403 error: the integration is not authorized to create projects in the `majkel2403s-projects` scope. After fixing the Vercel connection's scope, a deployment can be triggered without changing main.
