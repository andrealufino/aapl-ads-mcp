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

## Tools & Pagination

### Pagination helper

`AsaClient.getPaginated<T>(path, { limit?, offset? })` appends `limit` and `offset` query params to the path. Defaults: `limit=20`, `offset=0`. Uses `?` when no query string is present, `&` otherwise. All list tools expose `limit` and `offset` as optional input args and forward them directly to this helper.

Response envelope:

```json
{
  "pagination": { "totalResults": 250, "startIndex": 0, "itemsPerPage": 20 },
  "campaigns": [ ... ]
}
```

`pagination` is passed through from the ASA response as-is. If the API omits it (e.g. `list_orgs`), it is `undefined`.

### Tool Registry

| Tool | File | Endpoint | Auth required |
|------|------|----------|---------------|
| `health` | `tools/health.ts` | — | No |
| `list_orgs` | `tools/orgs.ts` | `GET /acls` | Yes |
| `list_campaigns` | `tools/campaigns.ts` | `GET /campaigns` | Yes |
| `list_ad_groups` | `tools/ad-groups.ts` | `GET /campaigns/:id/adgroups` | Yes |
| `list_keywords` | `tools/keywords.ts` | `GET /campaigns/:id/adgroups/:id/targetingkeywords` | Yes |

### Zod schemas per tool

Each tool file exports two schemas:

- `List*InputSchema` — validates and applies defaults to tool arguments before use
- `*OutputSchema` — strips/validates the ASA API response before returning to the caller

Input schemas are defined twice: inline in `server.tool()` (required by the MCP SDK for JSON Schema generation) and as a standalone `z.object()` export (used in tests). Both must be kept in sync.

`list_orgs` response shape (per org):

```json
{
  "orgId": 12345,
  "orgName": "Acme Inc.",
  "currency": "USD",
  "paymentModel": "PAYG",
  "timeZone": "America/New_York",
  "roleNames": ["API Account Manager"]
}
```

`list_campaigns` response shape:

```json
{
  "pagination": { "totalResults": 5, "startIndex": 0, "itemsPerPage": 20 },
  "campaigns": [
    {
      "id": 1234567890,
      "orgId": 9876543,
      "name": "Brand — US",
      "status": "ENABLED",
      "servingStatus": "RUNNING",
      "adamId": 123456789,
      "budgetAmount": { "amount": "5000.00", "currency": "USD" },
      "countriesOrRegions": ["US"],
      "supplySources": ["APPSTORE_SEARCH_RESULTS"],
      "adChannelType": "SEARCH",
      "billingEvent": "TAPS",
      "startTime": "2024-01-01T00:00:00.000Z",
      "creationTime": "2024-01-01T00:00:00.000Z",
      "modificationTime": "2024-06-01T00:00:00.000Z"
    }
  ]
}
```

## Testing Strategy

Unit tests live in `tests/`. No integration tests against the live ASA API (Apple provides no sandbox).

**`auth.test.ts`** covers:
- JWT claims: `iss`, `sub`, `aud`, `kid`, `jti`, `iat`, `exp` (~180s lifetime)
- Token exchange: correct `grant_type`, `client_id`, `scope` sent to Apple
- Cache: hit returns same token without a second `fetch`
- Cache: `invalidate()` forces re-fetch
- Cache: expired token (past `expires_in - 30s`) triggers re-fetch
- Error: non-2xx from Apple surfaces with HTTP status in message

Tests use `vi.stubGlobal("fetch", ...)` — no real network calls.
