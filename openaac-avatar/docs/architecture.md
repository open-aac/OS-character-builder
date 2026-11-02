# Architecture

## Packages

| Package | Runs in | Depends on | Purpose |
|---|---|---|---|
| `@openaac-avatar/core` | browser + Node | nothing | Art kit types, body blend, rig, poses, request validation, SVG output |
| `@openaac-avatar/artkit` | Node | core, `@xmldom/xmldom`, `svgpath` | Compiles and checks the designer's Inkscape files |
| `@openaac-avatar/cli` | Node | core | `openaac-avatar` command |
| `@openaac-avatar/server` | Node | core | HTTP API on `node:http` |
| `@openaac-avatar/editor` | browser | core | Editor page, built with Vite |

The core has one runtime dependency, [clipper-lib](https://www.npmjs.com/package/clipper-lib) (pure JavaScript polygon geometry, Boost Software License), and uses no DOM or Node APIs, so it can be dropped into any JS runtime, including an existing app.

Workspace packages are consumed from TypeScript source during development, through the `source` export condition (passed to tsx as `--conditions=source` in the package scripts, and set in the Vite/Vitest configs). They are consumed from `dist/` after `pnpm build`. The tooling (pnpm 10, TypeScript 6, Vite 8, Vitest 3, strict compiler flags) matches the opensymbols-v2 repo, so the packages can move into that monorepo later with minimal friction.

## Data flow

```
bm_low.svg ─┐
            ├─ parseInkscapeSvg ─ flatten transforms, cubic-only outlines, page-space stroke widths, pivots
bm_high.svg ┘
            ─ matchSubpaths ───── same node count, start point, direction and open/closed state
            ─ roles ───────────── fill colour → colour role; stroke width → body (10) / face (5)
            ─ validateKit ─────── every joint has a pivot; every part maps to a body segment
            → packages/core/src/kits/front.json

render request ─ normalizeRequest ─ morph(body) ─ resolvePose ─ jointMatrices ─ poseFigure ─ frameBox ─ SVG string
```

## The art kit format

`ArtKit` (see `packages/core/src/types.ts`):

- `parts[]`, in drawing order. Each part has `id`, `fillRole`, `fill`, `strokeRole`, and `shapes.low` / `shapes.high`. Each shape is a list of subpaths stored as flat absolute cubic arrays `[x0,y0, c1x,c1y,c2x,c2y,x,y, …]`. The two extremes always have identical layouts, so blending them is a straight `lerp` per number.
- `pivots`, keyed by joint name (`shoulder_R`, …). Each pivot holds its low and high positions.
- `strokeWidths`: `{ body: 10, face: 5 }` at the 1000 px canvas.

## Skeleton and part assignment

Joints: `neck`; and for each side `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`. `R` is the figure's right, which appears on the viewer's left.

Parts attach to joints by name (`packages/core/src/rig.ts`), so new art needs no code changes if it follows the naming rules:

| Name pattern | Moves with |
|---|---|
| `*arm_R_upper` (e.g. `arm_R_upper`, `shirt_arm_R_upper`) | `shoulder_R` |
| `*arm_R_lower` | `elbow_R` |
| `*arm_R_hand`, `*_thumb`, `*_fingers`, `glove_R…` | `wrist_R` |
| `*leg_R_upper` | `hip_R` |
| `*leg_R_lower` | `knee_R` |
| `*leg_R_foot`, `shoe_R…` | `ankle_R` |
| `head`, `hair…`, `ear_*`, `eye…`, `eyebrow…`, `nose`, `mouth`, `hat…`, `glasses…` | `neck` |
| anything else | torso (does not rotate) |

Parts are drawn in **units**: a limb plus the clothing on it (`leg_L`, `leg_R`, `arm_L`, `arm_R`), the bare torso (`trunk`: body skin and neck), the clothing on the torso (`torso`), and `head`. The default order, back to front, is trunk, legs, torso, arms, head. The trunk is always the back layer, so a small gap between garments shows clothing, not skin. A template pose can override the order. Poses with a raised arm draw that arm behind the torso, so the shirt's shoulder covers the joint and the sleeve's armpit edge doesn't show across the chest. Within a unit, the designer's layer order is kept.

A hanging arm stays in front of the torso, and its sleeve is merged into the shirt with exact shape geometry (`packages/core/src/merge.ts`, using Clipper polygon booleans and offsets): the shirt and its hanging sleeves are drawn as one shape (their union), so the sleeve's armpit edge no longer runs across the chest. The upper arm is cut to the part that comes out of the sleeve, and that piece is outlined all round (sides and cuff) except at the elbow end, where the forearm continues. The art leaves a band of underarm skin below the sleeve (the sleeve is cut short underneath); with the arm hanging it would run along the chest, so thin strips beside the sleeve are dropped, the cut is smoothed, and the forearm is hidden wherever the dropped part used to cover it. Arms whose forearm is brought across the body (`onTop` elbow, e.g. holding, eating) keep the full sleeve outline so the arm still reads.

Garment pieces drawn without an outline (the shorts' body, whose edges the shorts' legs normally cover) get one wherever their edge lies over bare leg that is still visible, e.g. across the thighs when sitting.

## Angles

- Degrees, relative to the drawn rest pose.
- Positive means up or away from the body on **both** sides, so `shoulder_L: 40, shoulder_R: 40` is symmetric. The core flips the sign for limbs on the viewer's right.
- Templates may give `{ low, high }` instead of a number. The value is blended with the body slider, for example so arms hang further out on a broader body.
- User adjustments are clamped to ±30° from the template (`adjustRange`), then to the joint's natural limits.

## Layering and variants

- `onTop: ['elbow_R', 'wrist_R']` in a template draws the parts moved by those joints in front of everything, including the face. Use it when a forearm reaches towards the viewer, for example hand to mouth.
- `variants: ['grip']` switches on alternative art named `<part>@grip`; `grip_R` limits it to the figure's right side. Variants on one joint are alternative sets: the pose's choice wins, otherwise `@open` is drawn. A variant with the same name as a plain part replaces it. Each variant can have a rule: `fallback` settings used while its art is missing (e.g. a shortened open hand), and `lock`ed joints once it exists (seated legs are drawn already posed). In output ids, `@` becomes `--`.

## Foreshortening

A template can scale a segment along its own axis (`scales: { hip_R: 0.3 }`). Hands and feet scale along the forearm or shin direction. Only that segment shortens; the next joint is moved to the end of the shortened segment, and the limb below keeps its full length. Because transforms are baked into the path points, outlines keep their exact stroke width.

## Views and clothing

- Each view is its own kit (`packages/core/src/kits/<view>.json`), built from the designer's files by `pnpm art:import` and `pnpm art:compile --view <view>`. A request's `view` picks the kit.
- Templates are written for the front (T-pose rest); `views` in a template gives its angles for other views (arms-hanging rest). Mirroring of `_L`/`_R` angles applies to limbs drawn as a pair; the side view's single arm and leg turn as written (positive = forward).
- Other views keep the designer's layer order (far limbs already behind) unless a template sets an order or `onTop` (the side view's raised near arm is drawn in front of the head).
- Other views are drawn with the arms down and limbs butted edge to edge, so the renderer adds: round caps behind the elbows and knees (only visible on the outside of a bend), a fill-coloured edge across each outline's opening, and trims the bare torso to the piece connected to the neck (the drawn torso is wider than the clothes where the arms hid it). Sleeve merging is front-only.
- Garments come from part names (`shirt_<style>_…`, `pants_<style>_…`); one style per slot is drawn (`wornStyles`). A variant drawn for one garment replaces the plain part whatever style it is in (`genericName`). Sitting in long trousers drops the `@sit` art (`availableVariants`), so the template's fallback poses the standing legs.

## Output SVG

```xml
<svg viewBox="…" width="300" height="300" data-generator="openaac-avatar" data-view="front" data-pose="waving">
  <metadata id="openaac-avatar-request">{"view":"front","pose":…,"avatar":…}</metadata>
  <g id="figure" stroke-linecap="round" stroke-linejoin="round">
    <g id="unit-leg_L" class="unit">
      <path id="leg_L_upper" class="part fill-skin stroke-body" d="M…" fill="#d59965" stroke="#000000" stroke-width="10"/>
      …
```

- Colour classes: `fill-skin`, `fill-hair`, `fill-iris`, `fill-eyeWhite`, `fill-top`, `fill-bottom`, `fill-ink`, `fill-fixed`.
- Line classes: `stroke-body`, `stroke-face`.
- To recolour an exported file, change the `fill` on every `.fill-<role>` path, or add CSS such as `.fill-skin{fill:#8d5524}`. To change line weight, scale `stroke-width` on `.stroke-body` and `.stroke-face`.
- When sleeves are merged, `shirt_body` is the shirt-and-sleeves shape and lists them in `data-merged`; the upper arm (and forearm) are written as `arm_<side>_upper` (skin, no line) plus `arm_<side>_upper_line`, and likewise `arm_<side>_lower`. A shorts edge drawn over bare legs is `pants_body_fill_edge`. These shapes are written as straight segments (`L`), finely sampled.
- `options.idPrefix` keeps ids unique when several symbols share one HTML page.

## Adding a view (side, ¾)

1. Put `bm_low.svg` and `bm_high.svg` in `art/source/<view>/`.
2. Run `pnpm art:compile --view <view>`.
3. Register the kit in `packages/core/src/kit.ts` (`KITS`).
4. Add templates for the view if they differ from the front templates.

The importer, blend, rig and output need no changes.
