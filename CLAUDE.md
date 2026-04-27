# aapl-ads-mcp — Claude Code Guide

Architecture reference: see `docs/ARCHITECTURE.md`.

## Commands

- **Build**: `npm run build`
- **Dev (watch)**: `npm run build && npm run dev`
- **Test**: `npm test`
- **Lint**: `npm run lint`
- **Type check**: `npm run typecheck`

Always run `npm run build` after code changes before testing.

## Code Style

- TypeScript strict mode, `exactOptionalPropertyTypes: true`
- No `any` — use `unknown` and narrow
- ESM modules: all imports need `.js` extension (even `.ts` files)
- Biome for lint + format (2-space indent, 100-char line width, double quotes)

## Project Structure

```
src/
  index.ts      entry point (stdio)
  server.ts     MCP server + tool registration
  config.ts     env validation via zod
  asa/
    auth.ts     JWT ES256 + token cache
    client.ts   HTTP client with 401 retry
    types.ts    ASA API v5 types
  tools/        one file per tool group
```

## Security Rules

- Never log tokens, keys, or PEM content
- `.env` and `*.pem` files must never be committed
- `gitleaks` runs on pre-commit via lefthook
