# CLI

Inside the repo, run it as `pnpm render <command> …`. Or call it directly with `node packages/cli/bin/openaac-avatar.js`. Inside the repo, it runs the TypeScript source. On a deployed copy without the source, it runs the built `dist/main.js` (`pnpm build` first).

## Render one symbol

```bash
openaac-avatar render --preset waving --body 0.7 \
  --skin '#8d5524' --hair '#1b1b1b' --top '#e53935' --bottom '#1565c0' \
  --framing upper --size 300 --title "hello" -o hello.svg
```

| Flag | Meaning |
|---|---|
| `--request <file>` | Start from a saved request (`.json`) or a generated symbol (`.svg`); other flags override it |
| `--view front\|three-quarter\|side` | Which art (default front) |
| `--preset <id>` | Template pose (`presets` lists which views each one is offered in) |
| `--wear slot=style` | Garment; repeatable (`--wear top=tight_long --wear bottom=loose_short`) |
| `--hair-style <style>` | Hair style or `none` (`presets` lists the styles); `--hair` is the hair colour |
| `--expression <name>` | Facial expression (`presets` lists them) |
| `--adjust joint=deg` | Adjust a joint; repeatable (`--adjust elbow_R=15 --adjust neck=-5`) |
| `--body <0..1>` | Body size |
| `--skin --hair --iris --eye-white --top --bottom --ink <#hex>` | Colours |
| `--line-weight <n>` | Line weight multiplier |
| `--framing full\|upper\|head\|canvas` | Crop |
| `--size <px>` `--padding <0..0.5>` `--background <#hex>` `--title <text>` `--id-prefix <id>` | Output options |
| `-o, --out <file>` | Output file (default stdout) |

## Bulk regenerate

```bash
openaac-avatar batch saved-symbols/ more.json --out-dir regenerated/
openaac-avatar batch saved-symbols/ --out-dir thick/ --avatar thick-lines.json
```

- Inputs can be `.json` requests, or `.svg` files this tool generated. The request is read back from the SVG's `<metadata>`.
- `--avatar <file>` and `--options <file>` hold JSON that is merged on top of every request, for example `{ "lineWeight": 2 }` or `{ "size": 100, "framing": "upper" }`.
- Each output keeps its input's base name. Failures are reported per file, and the exit code is 1 if any file failed.

This is the "art changed, update every symbol" workflow. After a new kit is compiled, run `batch` over the existing symbols, and they are redrawn with the new art and the same pose and settings.

## Reference

```bash
openaac-avatar presets   # template poses
openaac-avatar joints    # joint names and ranges
openaac-avatar help
```
