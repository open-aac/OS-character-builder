# Stand-in art

Temporary shapes drawn in code while the designer's versions are pending. Each file is a single right hand in its own frame: wrist at (0, 0), fingers pointing along +x, thumb towards −y.

| File | Becomes | Used by |
|---|---|---|
| `hand-relaxed.svg` | `arm_*_palm@relaxed`, `arm_*_thumb@relaxed` | arms hanging at the sides (standing, the free arm in waving and reaching) |
| `hand-rest.svg` | `arm_*_palm@rest`, `arm_*_thumb@rest` | hands resting on the knees (sitting) |
| `hand-point.svg` | `arm_*_palm@point`, `arm_*_thumb@point` | the pointing hand (pointing) |

`pnpm art:stand-ins` places them on the figure: at each wrist, along the forearm, mirrored for the left hand, for both body sizes. It writes `art/source/front/addons/stand-in-hands.{low,high}.svg`, which `pnpm art:compile` merges with the designer's files.

When the designer draws the real parts, delete the add-on files. If both exist, the compiler stops with a duplicate-part error.
