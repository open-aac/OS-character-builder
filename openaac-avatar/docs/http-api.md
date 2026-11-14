# HTTP API

```bash
pnpm serve                                   # development (TypeScript source)
pnpm build && node packages/server/dist/main.js   # production
```

Environment variables: `PORT` (default 8787), `HOST` (default 127.0.0.1; use 0.0.0.0 in a container), and `CORS_ORIGIN` (default `*`; set it to an empty string to send no CORS headers).

To mount the API inside an existing Node server, use `createApp()` from `@openaac-avatar/server`. It returns a standard `(req, res)` handler.

## POST /render

Body: a [request](request-format.md). Response: `image/svg+xml`.

```bash
curl -X POST http://127.0.0.1:8787/render \
  -H 'Content-Type: application/json' \
  -d '{"pose":{"preset":"holding"},"avatar":{"body":0.8,"colors":{"top":"#7b1fa2"}},"options":{"size":300}}' \
  -o holding.svg
```

## GET /render.svg

The same render from query parameters. The URL can go straight into an `<img src>`, and responses are cacheable for a day.

```
/render.svg?preset=waving&body=0.5&skin=8d5524&top=e53935&framing=upper&size=200
/render.svg?view=side&preset=pointing&wearTop=tight_long&wearBottom=loose_short
```

`view` picks the art (it also works on `POST /render`, or as `"view"` in the request body). `wearTop` and `wearBottom` pick garments; `hairStyle` and `expression` pick the hair style and facial expression (`hair` is the hair colour).

| Parameter | Example |
|---|---|
| `preset` | `waving` |
| `adjust` | `adjust=elbow_R:10,neck:-5`, or one per joint: `adjust.elbow_R=10` |
| `body`, `lineWeight` | `body=0.7` |
| `skin`, `hair`, `iris`, `eyeWhite`, `top`, `bottom`, `ink` | hex with or without `#` (URL-encode `#` as `%23`) |
| `framing`, `size`, `padding`, `background`, `title`, `idPrefix` | as in the request format |
| `embedRequest=false` | leave out the metadata |
| `view` | `front` (default) |

## POST /render/batch

```json
{ "requests": [ { "pose": { "preset": "sitting" } }, { "pose": { "preset": "nope" } } ] }
```

Returns one result per request, in order. Up to 200 requests per call.

```json
{ "results": [ { "svg": "<svg …" }, { "error": ["pose.preset must be one of: …"] } ] }
```

## GET /presets

Lists the views, template poses, joints and limits, the adjustment range, the colour roles with their defaults, and the framings. Use it to build a UI without hard-coding the lists.

## GET /health

`{ "ok": true }`

## Errors

| Status | When |
|---|---|
| 400 | Invalid request (`problems` lists every issue), malformed JSON, unknown view |
| 404 | Unknown route |
| 413 | Body over 256 KB (2 MB for batch), or more than 200 batch requests |
| 500 | Unexpected error (logged on the server) |
