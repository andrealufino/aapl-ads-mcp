# aapl-ads-mcp — Architecture

MCP server (stdio transport) for Apple Search Ads API v5. Read-only MVP.

## Auth Flow

ASA API v5 uses OAuth 2.0 `client_credentials` with a short-lived ES256 JWT as the client assertion.

```
startup
  └─ loadConfig()          reads .env + private key file from disk
        │
        ▼
  getAccessToken()         called before every API request
  ├─ cache hit?  →  return cached token
  └─ cache miss  →  buildClientAssertion()
                        sign JWT (ES256, kid, iss=clientId, aud=appleid.apple.com, exp=+3min)
                    POST /auth/oauth2/token
                        grant_type=client_credentials, scope=searchadsorg
                    cache token (expires_in - 30s buffer)
                    return access_token
```

On `401` from ASA: `AsaAuth.invalidate()` → retry once with a fresh token.

The access token is **never written to disk**. The private key PEM is read once at startup.

## HTTP Client (`AsaClient`)

- Base URL: `https://api.searchads.apple.com/api/v5`
- Injects `Authorization: Bearer <token>` and `X-AP-Context: orgId=<orgId>` on every request
- 401 → invalidate cache + retry once
- 429 → surface as clear error (no automatic backoff in MVP)
- 5xx → surface as error
- All responses typed via `AsaApiResponse<T>`

## Tool Design

Each tool file in `src/tools/` exports a `register*Tool(server, client)` function.

`src/server.ts` imports all register functions and calls them in sequence — keeps `server.ts` thin.

Tool inputs are validated with zod schemas defined inline per tool. Errors from zod surface as MCP tool errors automatically.

## Error Handling Conventions

- Config errors (missing env, missing key file): thrown at startup before the server connects — fail fast, clear message
- Auth errors: thrown from `getAccessToken()`, surface as tool errors
- API errors: `AsaClient` throws with HTTP status and response body for non-2xx responses
- Tool handlers: let errors propagate — MCP SDK converts unhandled exceptions to error responses

## Pagination

ASA API v5 uses offset-based pagination (`startIndex`, `itemsPerPage`). The MVP does not auto-paginate — it returns the first page (default 20 items). Future: add `limit`/`offset` tool args.
