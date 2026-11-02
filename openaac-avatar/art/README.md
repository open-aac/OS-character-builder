# Art

`source/<view>/bm_low.svg` and `bm_high.svg` hold the designer's files exactly as delivered: the slimmest and the broadest body for that view.

After replacing them, run:

```bash
pnpm art:validate   # check only; writes reports/<view>.md
pnpm art:compile    # check, then rebuild packages/core/src/kits/<view>.json
```

The rules the files are checked against are in [../docs/art-authoring.md](../docs/art-authoring.md).

| View | Files | Source |
|---|---|---|
| front | `source/front/` | Markley, 14 Oct 2026 (adds open/grip hands and seated legs to the 12 Oct files) |
