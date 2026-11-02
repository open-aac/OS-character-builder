# OpenAAC person symbol generator

A posable, recolourable SVG person for AAC picture symbols. You pick a template pose, adjust it a little, set body size, colours and line weight, and get a clean, labelled SVG.

The same render core runs everywhere:

- **Editor page**: a browser UI for making symbols by hand.
- **CLI**: renders one symbol, or re-renders a whole folder of saved symbols after new art arrives.
- **HTTP endpoint**: send pose and avatar settings, get an SVG back.

Because they share the code, the editor preview, the CLI output and the server output are always identical.

```
┌──────────────┐   pnpm art:compile   ┌───────────────────────────┐
│ Inkscape art │ ───────────────────▶ │ art kit JSON (core/kits)  │
│ bm_low.svg   │  flatten, match,     └─────────────┬─────────────┘
│ bm_high.svg  │  check against rules               │
└──────────────┘                     ┌──────────────▼─────────────┐
                                     │ @openaac-avatar/core        │
                                     │ body blend → pose → SVG     │
                                     └───┬──────────┬──────────┬───┘
                                         │          │          │
                                     editor       CLI     HTTP server
```

## Quick start

Requires Node 22.12+ and pnpm 10. If `pnpm` isn't installed: `npm install -g pnpm@10`, then open a new terminal. On Windows, keep the project outside OneDrive (e.g. `C:\dev\openaac-avatar`), because syncing `node_modules` is slow and can lock files.

```bash
pnpm install
pnpm dev                     # editor at http://localhost:5173
pnpm serve                   # API at http://127.0.0.1:8787
pnpm render render --preset waving --body 0.7 --skin '#8d5524' -o wave.svg
pnpm test                    # all packages
```

Try the API in a browser while `pnpm serve` is running:
`http://127.0.0.1:8787/render.svg?preset=waving&body=0.5&framing=upper&size=300`

## Repository layout

```
art/
  source/front/        Designer's files, as delivered (bm_low.svg = slim, bm_high.svg = broad)
  reports/front.md     Plain-language art check, regenerated on every compile
packages/
  core/                Shared render core. No DOM or Node APIs; runs in browser and Node.
    src/kits/front.json   Compiled art kit (generated: do not edit by hand)
  artkit/              Inkscape SVG → art kit compiler and art checker (Node only)
  cli/                 `openaac-avatar` command
  server/              HTTP API (plain node:http, mountable in another server)
  editor/              Editor page (Vite, no framework); builds to a static site in dist/
docs/                  Architecture, art rules, request format, CLI and API reference
examples/requests/     Sample saved requests (used by the CLI tests)
scripts/               Dev helpers for visual checks (preview sheets, screenshots)
```

## Common tasks

| Task | Command |
|---|---|
| Check new art without changing anything | `pnpm art:validate` |
| Re-place the stand-in hands after the body art changes | `pnpm art:stand-ins` |
| Rebuild the art kit after the designer sends files | `pnpm art:compile` |
| Contact sheet of every pose at three body sizes | `pnpm preview` (writes `out/preview/`) |
| Re-render a folder of saved symbols with the current art | `pnpm render batch saved/ --out-dir regenerated/` |
| Build the editor website (static folder to upload anywhere) | `pnpm build:web` → `packages/editor/dist/` |
| Production build (core, CLI, server, editor) | `pnpm build` |
| Type check | `pnpm typecheck` |

## How it works, briefly

1. **Art kit.** The two body extremes are flattened (all Inkscape transforms baked in) into absolute cubic Bézier outlines. Each part in the slim file is paired with the same part in the broad file, node for node. Where the designer drew them differently, the compiler fixes it automatically and says so in `art/reports/front.md`. It adds nodes, re-orders start points and reconciles open versus closed outlines.
2. **Body slider.** The two extremes, and the joint pivots, are blended linearly, so any value between 0 and 1 is a valid body.
3. **Pose.** Each template sets joint angles relative to the drawn rest pose. Users can adjust each joint by ±30°, within natural limits. Forward kinematics rotates each limb about its pivot. Foreshortening (thighs when sitting) shortens a segment along its own axis without stretching the limb below it. Transforms are baked into the output paths, so line weights stay exact.
4. **Output.** Every path carries its part id plus role classes (`fill-skin`, `fill-top`, `stroke-body`, …), so colours and line weights can still be changed after export. The request is embedded in `<metadata>`, so any generated SVG can be re-rendered later with new art.

More detail: [docs/architecture.md](docs/architecture.md).

## Status

| Area | State |
|---|---|
| Front view art kit (Markley, 14 Oct: open and gripping hands, seated legs) | Compiles; small auto-fixes listed in `art/reports/front.md`, none blocking |
| Body size slider | Working, continuous |
| Template poses | Standing, waving, reaching, holding, sitting, sitting with utensil, pointing, jumping, cheering (the offer's 5 plus 4 extra) |
| Pose-specific art (`part@variant`) | In use: gripping hands and seated legs (Markley); relaxed, resting and pointing hands (code-drawn stand-ins in `art/stand-ins/`) |
| Joint adjustment (±30°, natural limits) | Working |
| Colour roles, line weight, framing (full / upper / head / canvas) | Working |
| CLI (render, batch regenerate) | Working |
| HTTP API (POST, GET for `<img src>`, batch) | Working |
| Editor page | Working: views, poses, joint sliders, body, clothing, colours (outlines stay black), line weight 0.75–1, export SVG/PNG, request JSON |
| Side and ¾ views | Waiting for art; the pipeline takes a new view as `art/source/<view>/` |


