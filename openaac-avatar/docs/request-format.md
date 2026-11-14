# Request format

A request describes one symbol. The CLI (`--request`, `batch`), the HTTP API (`POST /render`) and the editor ("Request JSON…") all use the same format. Every field is optional.

```json
{
  "view": "front",
  "pose": {
    "preset": "waving",
    "adjust": { "elbow_R": 10, "neck": -5 }
  },
  "avatar": {
    "body": 0.5,
    "colors": { "skin": "#8d5524", "hair": "#1b1b1b", "top": "#e53935", "bottom": "#1565c0" },
    "lineWeight": 1,
    "clothing": { "top": "tight_short", "bottom": "tight_long" },
    "hair": "long_straight",
    "expression": "content"
  },
  "options": {
    "framing": "full",
    "size": 300,
    "padding": 0.04,
    "background": null,
    "title": "hello",
    "idPrefix": "",
    "embedRequest": true
  }
}
```

## view

`front` (default), `three-quarter` or `side`. Not every template is offered in every view yet: sitting and sitting with a utensil are front only, holding is front and side. Asking for one a view doesn't have is an error that lists what it does have.

## pose

| Field | Default | Notes |
|---|---|---|
| `preset` | `standing` | `standing`, `waving`, `reaching`, `holding`, `sitting`, `sitting-utensil`, `pointing`, `jumping`, `cheering` |
| `adjust` | `{}` | Degrees added to the template per joint. Clamped to ±30° and to the joint's natural range. |

Joints: `neck`, `shoulder_R`, `elbow_R`, `wrist_R`, `hip_R`, `knee_R`, `ankle_R`, and the same for `_L`. `R` is the figure's right (the viewer's left). Positive values move a limb up or away from the body on either side; `neck` positive tilts the head towards the viewer's right.

Natural ranges (relative to the drawn rest pose, before any template):

| Joint | Range |
|---|---|
| neck | −25° … 25° |
| shoulder | −80° … 150° |
| elbow | −150° … 150° |
| wrist | −70° … 70° |
| hip | −20° … 70° |
| knee | −70° … 70° |
| ankle | −45° … 45° |

## avatar

| Field | Default | Range |
|---|---|---|
| `body` | `0.5` | 0 (slim) to 1 (broad), continuous |
| `colors` | placeholders | Any of `skin`, `hair`, `iris`, `eyeWhite`, `top`, `bottom`, `ink` as `#rgb` or `#rrggbb` |
| `lineWeight` | `1` | 0.25 to 4; multiplies both line weights (10 and 5 at the 1000 px canvas). The editor offers 0.75 to 1, per the art direction (heavier loses legibility, thinner shows gaps) |
| `clothing` | first style in the art | `{ "top": …, "bottom": … }`. Front styles now: top `tight_short`, `loose_short`, `tight_long` (long sleeves); bottom `tight_short`, `loose_short`, `tight_long` (trousers). Views with one outfit ignore it |
| `hair` | `short_straight` | Hair style from the art, or `none`: `short_straight`, `short_textured`, `long_straight`, `long_textured`. Its colour is `colors.hair` |
| `expression` | `content` | Facial expression from the art: `content`, `surprised`, `unhappy`, `puzzled`, `angry` |

## options

| Field | Default | Notes |
|---|---|---|
| `framing` | `full` | `full` (whole figure), `upper` (head, torso, arms), `head` (close-up), `canvas` (the original 1000 × 1000 page). Cropped framings are square and centred. |
| `size` | `1000` | Output width and height in px (16 to 4096). Only the `width` and `height` attributes change; the SVG stays vector. |
| `padding` | `0.04` | Space around a cropped figure, as a fraction of the crop (0 to 0.5) |
| `background` | none | Hex colour for a solid square behind the figure |
| `title` | none | Adds `<title>` and `role="img"` for screen readers |
| `idPrefix` | `''` | Prefix for every element id, so several symbols can share one HTML page |
| `embedRequest` | `true` | Stores `view`, `pose` and `avatar` (with clothing) in `<metadata>` so the file can be re-rendered later |

## Errors

Invalid requests are rejected with every problem listed, for example:

```json
{ "error": "invalid request", "problems": ["pose.preset must be one of: …", "avatar.body must be between 0 and 1"] }
```
