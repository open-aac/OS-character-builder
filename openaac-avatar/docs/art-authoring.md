# Art rules

For the designer. These rules are what the compiler checks. Run `pnpm art:validate` at any time; it writes a plain-language report to `art/reports/<view>.md`.

## Files

- Two delivered files: `…_low.svg` (slimmest body) and `…_high.svg` (broadest body). Each holds every view as a top-level layer: the front (any name), `…3-4` (¾ view) and `…side`.
- Import them with `pnpm art:import <low.svg> <high.svg>`. This writes one folder per view (`art/source/front/`, `art/source/three-quarter/`, `art/source/side/`) and keeps the originals in `art/source/delivered/`. Then build each view with `pnpm art:compile --view <view>`.
- The import fills in names the rig needs, and lists every change it makes:
  - A generic name inside a sided group takes the side: `hand` in `arm_L` → `arm_L_hand`, `eye_fill` in `eye_R` → `eye_R_fill`.
  - Side view: the figure faces the viewer's left, so the one arm and leg drawn are the figure's **left**. Unsided names get `_L` (`arm_upper` → `arm_L_upper`, `pivot_knee` → `pivot_knee_L`).
  - ¾ view: the single ear drawn is `ear_L`.
  - Garment layers hidden in Inkscape are shown again (they are alternatives you toggle while drawing).
- Canvas 1000 × 1000 px, with document units in px. Both figures should sit in the same place on the canvas.
- Remove reference photos and guide layers before delivery. Layers named `ratios…`, `ref…`, `guide…` or `sketch…` are skipped if left in, with a note in the report.

## Parts

- Each body part and garment piece is one path, labelled in Inkscape (Object Properties → Label). The label is the part's name.
- **Both files must contain exactly the same part names.** A part missing from either file stops the build.
- Draw both sides (`_L` and `_R`). `R` is the figure's right, which is on the viewer's left.
- No live path effects. Mirror Symmetry in particular must be removed with Path ▸ Path Effects, not with Object to Path.

### Names decide what moves a part

| Name | Moves with |
|---|---|
| `arm_R_upper`, `shirt_arm_R_upper`, `jacket_arm_R_upper` | shoulder |
| `arm_R_lower`, `shirt_arm_R_lower` | elbow |
| `arm_R_hand`, `arm_R_thumb` | wrist |
| `leg_R_upper`, `pants_leg_R_upper` | hip |
| `leg_R_lower`, `pants_leg_R_lower` | knee |
| `leg_R_foot`, `shoe_R` | ankle |
| `head`, `hair`, `ear_R`, `nose`, `mouth`, `eye_R_…`, `eyebrow_R`, `hat…`, `glasses…` | neck |
| `body`, `shirt_body`, `pants_body_fill`, `pants_body_line`, … | torso (never rotates) |

A garment that crosses a joint (a long sleeve over the elbow, trousers over the knee) must be split at that joint into `_upper` and `_lower` pieces.

### Clothing

Each garment is a set of parts named `<kind>_<style>_<piece>`, e.g. `shirt_tight_long_body`, `shirt_tight_long_arm_R_lower`, `pants_loose_short_leg_L_upper`. The style is two words (`tight_short`, `loose_long`, …).

- `shirt`, `top`, `dress`, `jacket`, `coat` are worn on top; `pants`, `shorts`, `trousers`, `skirt`, `leggings` on the bottom. One style per slot is drawn; the editor's Clothing panel and the request's `avatar.clothing` pick it. New styles appear in the editor by themselves.
- Garments are recoloured by what they are (top or bottom colour), whatever placeholder colour they are drawn in.
- Layer order matters: draw bottoms before tops if the shirt hangs over the waistband.
- ¾ and side views drawn in a single unstyled outfit (`shirt_body`, `pants_leg_L_upper`, …): that outfit becomes `tight_short`, and stand-in `tight_long` (long sleeves, trousers) and `loose_short` styles are made from it when compiling (`packages/artkit/src/derive.ts`): the limbs grown slightly and cut at the wrist and ankle, or the drawn garment grown. As soon as the designer draws styled garments for a view, the stand-ins are no longer made for it.
- Front view, seated: the seated shorts (`pants_leg_L_upper@sit`) become `tight_short`, and seated `loose_short` and `tight_long` (trousers over the seated thigh and shin) are made from them and the seated legs. Drawn `pants_<style>_leg_…@sit` parts replace them.
- A sleeve or trouser leg is drawn as one piece (no line across the elbow or knee), except when the limb is folded back on itself (a hand brought to the mouth), where the forearm keeps its outline in front of the upper arm.
- Front view: the two sleeves are made symmetrical when compiling. The left sleeve is replaced by the right one mirrored about the neck, so draw the right sleeve with care (the compile report lists any left sleeve that differed).
- The seated legs (`@sit`) are drawn with shorts (`pants_leg_*_upper@sit`). With long trousers, the sitting poses pose the standing legs instead; seated trouser legs (`pants_tight_long_leg_*_upper@sit` and `_lower@sit`) would remove that compromise.

### Views

The front is drawn in a T-pose; the ¾ and side views with the arms hanging. Templates give angles per view (see `views` in `packages/core/src/presets.ts`), so a pose is offered in a view once it has been set up there. Sitting needs seated art for that view.

Sitting in the side view is posed from the standing legs (thigh forward, shin down, lengthened a little so the figure sits on a chair; each thigh keeps only what is in front of the hip and above the seat). The ¾ view uses stand-in seated legs (`leg_X_upper@sit`, `leg_X_foot@sit`, seated shorts) traced from a reference drawing of the broad body by `scripts/make-quarter-sit.py` (written to `art/source/three-quarter/addons/stand-in-sit.*.svg`; the slim legs are the same outline mapped onto slimmer legs). Trousers and loose shorts are made from them when compiling. Delete the add-on when the designer draws seated ¾ legs.

The side art has only the near (left) arm. Compiling adds a far arm (`arm_R_…`, with its sleeve) copied from it, drawn behind everything on the same pivots. It follows the near arm, hidden behind it, unless a template moves it: the side waving pose waves with the far hand while the near arm hangs. Its waving hand is the near one turned over.

## Alternative art for some poses (variants)

Some poses need a different drawing of a part. Name the extra part `<part>@<variant>`, put it in **both** files, and draw it with the same rules as everything else.

- **Alternative sets on one joint.** Variants on the same joint are alternatives, and only one set is drawn at a time. The hands have an `@open` set (the default, used by every pose that doesn't ask for something else) and an `@grip` set. Each set can have any number of pieces, e.g. `arm_R_palm@grip`, `arm_R_palm_index@grip`, `arm_R_thumb@grip`.
- **Replacing a plain part.** A variant with the same name as a plain part replaces it while the variant is on. For example, `leg_R_upper@sit` replaces `leg_R_upper` in the sitting poses.

| Variant | Used by | Notes |
|---|---|---|
| `@open` hand pieces | every pose by default | |
| `@grip` hand pieces | Holding (both hands), Sitting with a utensil (right hand) | Same wrist position as the open hand |
| `@sit` leg pieces (`leg_*_upper`, `_lower`, `_foot`, `pants_leg_*_upper`) | Sitting, Sitting with a utensil | Drawn already seated, so the leg joints can't be adjusted in these poses |
| `@rest` hand pieces | Sitting (both hands), Sitting with a utensil (left hand) | Back of the hand, fingers draped forward over the knee. Currently a code-drawn stand-in (see below) |
| `@relaxed` hand pieces | Standing, and the free arm in Waving, Reaching and Pointing | Hand seen from the side, thumb forward, fingers together pointing down. Currently a code-drawn stand-in (see below) |
| `@point` hand pieces | Pointing (right hand) | Fist with the index finger stretched out. Currently a code-drawn stand-in (see below) |
| `arm_L_hand@wave` (side view) | Waving, side view | Open hand, palm towards the viewer, fingers up. Currently a stand-in made from the front view's open hand (see below) |

### Stand-ins

`@relaxed`, `@rest` and `@point` hands are temporary shapes drawn in code (`art/stand-ins/`), placed on the figure by `pnpm art:stand-ins` into `art/source/front/addons/`. To replace them with designed versions, draw `arm_R_palm@relaxed`, `arm_R_thumb@relaxed` (and `@rest`, and the `_L` versions) in both files, then delete the `addons/stand-in-hands.*.svg` files and run `pnpm art:compile`.

The ¾ view's gripping hand (`arm_X_hand@grip`, used for sitting with a utensil) is made by `scripts/make-grip-hand.ts` from the front art's gripping hand (`arm_R_palm@grip`, its fingers and thumb), then placed by `pnpm art:stand-ins`. A drawn `arm_X_hand@grip` in the ¾ files replaces it.

The side view's waving hand is made by `scripts/make-wave-hand.ts` from the front art's `arm_R_palm@open` and `arm_R_thumb@open` (written to `art/stand-ins/hand-wave.svg`), then placed by `pnpm art:stand-ins` into `art/source/side/addons/`. A drawn `arm_L_hand@wave` in the side files replaces it (delete that add-on).

If a variant is missing, the pose still works with a simpler stand-in (a shortened open hand, a shortened thigh).

## Matching the two extremes (for the body slider)

The slider blends each part from the slim shape to the broad shape point by point. When the nodes of a part are spread very differently along its outline in the two files (common when a part was redrawn), the compiler pairs the outlines by position along their length instead, so the in-between shapes don't twist. When an outline is left open in different places in the two files, both are opened at the same place: the limb's knee or elbow, where a line would otherwise show when it bends. The report notes each such part. The best way to keep the two shapes compatible: copy the part from one file into the other, then **move** its nodes. Don't redraw it, and don't add or delete nodes in only one file.

The compiler fixes these automatically, but each fix is a guess, so it's better avoided in the art:

- a different number of nodes (it adds nodes to the shorter one)
- a different start point or drawing direction (it re-orders)
- closed in one file but open in the other (it draws both open)

## Joints

A layer named `pivots` with one small circle per joint. Only the circle's centre is used:

`pivot_neck`, `pivot_shoulder_R`, `pivot_elbow_R`, `pivot_wrist_R`, `pivot_hip_R`, `pivot_knee_R`, `pivot_ankle_R`, and the same for `_L`.

Place each circle where the limb actually rotates, which is usually slightly inside the outline. Both files need all 13 circles, each positioned for that body.

## Colours

Flat fills only: no gradients, patterns, transparency or blur. Use these placeholder colours; the program swaps them for the user's choices:

| Role | Placeholder | Used on |
|---|---|---|
| skin | `#d59965` | body, limbs, head, ears |
| hair | `#2b190d` | hair, eyebrows |
| iris | `#482e11` | `eye_*_iris` |
| top | `#ffffff` | parts named `shirt…`, `top…`, `dress…`, `jacket…`, `coat…` |
| eye white | `#ffffff` | `eye_*_fill` |
| bottom | `#acacac` | trousers, shorts, skirts |
| ink | `#000000` | outlines |

Any other colour is kept exactly as drawn and can't be recoloured. The report lists these.

## Line weights

- Body, limbs, clothing, hair and head outline: **10 px**
- Eyes, eyebrows, nose, mouth: **5 px**

Weights are measured as they appear on the page, so a part that is scaled in Inkscape still works. The program redraws every outline at exactly 10 or 5 px, multiplied by the user's line-weight setting.

## Outlines at joints

A limb segment is usually left open where it tucks under the next segment (for example the top of the lower arm under the elbow), so no outline is drawn across the join. Do the same in both files.
