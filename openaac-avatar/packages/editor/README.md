# Person Symbol Editor

The web page for making symbols by hand. It runs entirely in the browser using the shared render core, so it needs no server.

## Develop

```bash
pnpm dev          # from the repo root; opens http://localhost:5173 with live reload
```

## Build and deploy

```bash
pnpm build:web    # from the repo root (or `pnpm build` in this folder)
```

This writes a static site to `dist/`:

```
dist/
  index.html
  css/editor-[hash].css
  js/editor-[hash].js         this page's code
  js/render-core-[hash].js    the shared render core (same code as the CLI and server)
  js/art-kit-[hash].js        the compiled artwork
  assets/                     favicon, background image, Nunito font files
```

Upload the whole `dist/` folder to any static host: Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, or a folder on an existing web server. Paths are relative, so it also works from a sub-path such as `/tools/symbols/`. The hashes in the file names change whenever the content changes, so visitors never get a stale cached copy.

Browsers block JavaScript modules on `file://`, so to try the build locally use `pnpm --filter @openaac-avatar/editor preview` instead of double-clicking `index.html`.

## Source layout

```
index.html               page shell and the two dialogs
public/assets/           static files copied as-is (favicon)
src/
  main.ts                entry point: wires the store, preview, panels and dialogs
  state/
    store.ts             editor state, conversion to/from a render request, change events
    persist.ts           remembers the last symbol in this browser (optional)
  render/
    symbol.ts            renders the state through @openaac-avatar/core
    preview.ts           large preview and 100/50 px thumbnails
  assets/                background image (WebP with JPEG fallback)
  ui/
    icons.ts             small line icons for panel and group headings
    components.ts        panel, coloured group, slider, chip group, button
    controls.ts          assembles the settings column
    panels/              pose, adjust, body, colours, lines, export
    dialogs/             export (PNG/SVG) and request JSON
  config/
    labels.ts            display names for joints, colours, framings
    swatches.ts          quick-pick colours
  lib/
    dom.ts               element helpers
    files.ts             downloads and SVG → PNG
  styles/
    index.css            imports the rest in order
    tokens.css           light and dark colour tokens
    base.css             element defaults, buttons, utilities
    layout.css           header, preview column, responsive layout
    controls.css         settings panels
    dialogs.css          dialogs
    effects.css          entrance, pose-change pop, floating doodles (off with reduced motion)
```

The font (Nunito) is bundled from `@fontsource-variable/nunito`, so the site makes no third-party requests.

Everything about poses, art and output lives in `@openaac-avatar/core`. This package only holds the UI.
