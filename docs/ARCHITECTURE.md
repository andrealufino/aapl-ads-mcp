# aapl-ads-mcp — Architecture

MCP server (stdio transport) for Apple Search Ads API v5. Read-only.

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node.js 20+ | native `fetch`, no `node-fetch` |
| Language | TypeScript strict + `exactOptionalPropertyTypes` | no `any` — use `unknown` and narrow |
| MCP SDK | `@modelcontextprotocol/sdk` | official, stdio transport |
| JWT | `jose` | native Web Crypto, zero runtime deps |
| Validation | `zod` | tool input schemas + API response parsing |
| Lint / format | Biome | single tool, 2-space indent, 100-char lines, double quotes |
| Test | Vitest | no integration tests — Apple provides no sandbox |
| Build | `tsc` direct | no bundler needed for stdio MCP |
| Pre-commit | lefthook + gitleaks | secret scanning on every staged commit |

## Project structure

```
src/
  index.ts        Entry point — wires stdio transport to the server
  server.ts       Creates McpServer, registers all tools; kept thin
  config.ts       Reads and validates env vars with zod; reads PEM from disk
  asa/
    auth.ts       JWT ES256 generation and access token in-memory cache
    client.ts     HTTP client — auth header injection, error mapping, 401 retry
    types.ts      TypeScript types for ASA API v5 responses
  tools/
    index.ts      Re-exports all register*() functions
    health.ts     health tool — no auth, fast sanity check
    orgs.ts       list_orgs
    campaigns.ts  list_campaigns
    ad-groups.ts  list_ad_groups
    keywords.ts   list_keywords
    reports.ts    get_campaign_report, get_ad_group_report,
                  get_keyword_report, get_search_terms_report

tests/
  auth.test.ts    JWT claims, token cache, error on bad fetch
  client.test.ts  HTTP error mapping, 401 retry
  tools.test.ts   Zod input/output schemas, date utilities

docs/
  ARCHITECTURE.md  This file
```

## Authentication flow

ASA API v5 uses OAuth 2.0 `client_credentials` with a short-lived ES256 JWT as
the client assertion. The flow runs in two stages.

### Startup (once)

`config.ts` reads and validates all env vars via zod. If any variable is missing
or the PEM file does not exist at `ASA_PRIVATE_KEY_PATH`, it throws immediately
before the MCP server connects. This is intentional — fail fast with a clear
message rather than silently returning empty tool results later.

### Runtime (per API call)

```
getAccessToken()
├─ cache hit && not expired  →  return cached access_token
└─ cache miss / expired
      buildClientAssertion()
        importPKCS8(privateKeyPem, "ES256")   ← jose, PKCS#8 only
        SignJWT({})
          .setProtectedHeader({ alg: "ES256", kid: keyId })
          .setIssuer(clientId)
          .setSubject(clientId)
          .setAudience("https://appleid.apple.com")
          .setIssuedAt()
          .setExpirationTime("180s")
          .setJti(crypto.randomUUID())
          .sign(privateKey)
      POST https://appleid.apple.com/auth/oauth2/token
        grant_type=client_credentials
        client_id=<clientId>
        client_secret=<JWT>
        scope=searchadsorg
      cache { accessToken, expiresAt: now + (expires_in - 30) * 1000 }
      return access_token
```

The 30-second safety margin on `expiresAt` avoids using a token right as it
expires on a slow network. The access token is **never written to disk**.

On `401` from ASA: `AsaAuth.invalidate()` clears the cache; the caller retries
once with a fresh token. If the second request also returns 401, the error is
surfaced directly.

## HTTP client (`AsaClient`)

`src/asa/client.ts` wraps `fetch` with three responsibilities:

**Auth header injection** — every request gets:
- `Authorization: Bearer <access_token>`
- `X-AP-Context: orgId=<orgId>` — required by ASA v5 to scope the response to
  the correct organization. Without it, many endpoints return 403 or empty data.

**Error mapping** — non-2xx responses are converted to actionable Error messages:

| Status | Message |
|--------|---------|
| 401 (after retry) | Authentication failed — check key/client_id |
| 403 | Access denied — check API user role |
| 404 | Resource not found — check IDs |
| 429 | Rate limit exceeded |
| 5xx | Server error, try again |
| other | Status code + body (truncated to 300 chars to avoid metadata leakage) |

**Pagination helper** — `getPaginated(path, { limit?, offset? })` appends
`limit` and `offset` as query parameters, using `?` when no query string exists
and `&` otherwise. All list tools forward their `limit` and `offset` args here.

## Tool design pattern

Each file in `src/tools/` exports a single `register*Tools(server, client)`
function. `server.ts` imports and calls them all — tool registration stays out of
`server.ts`.

Inside each register function, the canonical pattern is:

```typescript
server.tool(
  "tool_name",
  "Human-readable description for the LLM.",
  {
    // Inline zod schema — required by MCP SDK for JSON Schema generation
    param: z.number().int().positive().describe("What this param is."),
  },
  async (args) => {
    const input = ToolInputSchema.parse(args);  // validate + apply defaults

    // ... call client, parse response with output schema ...

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);
```

Input schemas are defined twice: inline in `server.tool()` (for JSON Schema
generation) and as a standalone `z.object()` export (used in tests). Keep them
in sync when adding fields.

Errors thrown inside the handler propagate up to the MCP SDK, which converts
them into spec-compliant error responses. No manual error wrapping is needed.

## Reports

All four report tools share helpers in `src/tools/reports.ts`.

### Endpoints

Reports use `POST`, not `GET`:

| Tool | Endpoint |
|------|---------|
| `get_campaign_report` | `POST /reports/campaigns` |
| `get_ad_group_report` | `POST /reports/campaigns/{campaignId}/adgroups` |
| `get_keyword_report` | `POST /reports/campaigns/{campaignId}/keywords` |
| `get_search_terms_report` | `POST /reports/campaigns/{campaignId}/searchterms` |

### Request body

The `selector` field is **mandatory** even when no conditions are needed.
Omitting it causes a 400 error from ASA.

All reports send `groupBy: ["countryOrRegion"]`. Without it some metric fields
may be absent or null in the response.

### Defaults

| Parameter | Default |
|-----------|---------|
| `startDate` | today − 30 days |
| `endDate` | today |
| `granularity` | `WEEKLY` |

## Schema lessons (hard-won from Phase 3 testing)

These are non-obvious facts about ASA v5 that are not well documented or that
changed recently. Future contributors should read this section before touching
the report schemas or query logic.

### Metric field names changed in July 2024

ASA v5 added view-through attribution in mid-2024 and renamed several fields.
The old names no longer appear in API responses:

| Old (pre-2024) | New (v5 current) |
|----------------|-----------------|
| `installs` | `tapInstalls` / `viewInstalls` / `totalInstalls` |
| `newDownloads` | `tapNewDownloads` / `viewNewDownloads` / `totalNewDownloads` |
| `redownloads` | `tapRedownloads` / `viewRedownloads` / `totalRedownloads` |
| `avgCPA` | `tapInstallCPI` / `totalAvgCPI` |
| `conversionRate` | `tapInstallRate` / `totalInstallRate` |
| `spend` | `localSpend` |

Do not rely on any ASA documentation older than mid-2024.

### Granularity rows are flat, not nested

When `granularity` is set, each row in the response contains metrics at the top
level alongside `date`:

```json
{ "date": "2024-04-01", "impressions": 1200, "localSpend": { "amount": "30.00", "currency": "USD" } }
```

Older v3/v4 docs showed `{ "date": "...", "metrics": { ... } }`. The `metrics`
wrapper does not exist in v5.

### Search terms reports: no granularity + returnRowTotals

The `/searchterms` endpoint rejects requests that include both `granularity` and
`returnRowTotals: true`. The `get_search_terms_report` tool omits `granularity`
entirely from the request body as a result.

### campaignId in URL path — do not repeat in selector

For ad-group, keyword, and search-terms reports, `campaignId` is embedded in the
URL path (`/reports/campaigns/{campaignId}/...`). Including it as a selector
condition causes `INVALID_CONDITION_INPUT` from ASA. Only `adGroupId` goes in
the selector for these endpoints.

### Nullable fields despite docs

Several fields are documented as required but come back `null` or absent in
practice, especially for campaigns or ad groups with no spend:
- `budgetAmount` on Campaign
- `endTime` on Campaign and AdGroup
- `orgId` on Keyword
- Any metric in `MetricsSchema` for a period with no activity

Every field in `MetricsSchema` and `GranularityRowSchema` is
`.nullable().optional()` to prevent zod parse failures on sparse responses.

### API role and metric availability

An API user with only **Campaign Manager** role may receive absent spend/CPA
metrics regardless of request parameters. The **API Account Manager** role is
required to see financial metrics. If metrics are unexpectedly null after a
valid request, check the user role in ASA → Account Settings → User Management.

## Security

`ASA_PRIVATE_KEY_PATH` must be an absolute path — Node.js does not expand `~`.
The private key PEM is read once at startup and held in memory as a string.
It is never logged — the logger (`process.stderr`) only emits fatal startup
errors and the `fetchNewToken` error path, neither of which includes key material.

The pre-commit hook runs `gitleaks protect --staged --verbose --redact` via
lefthook. `.gitleaks.toml` allows `.env.example` (fake placeholders only).
The GitHub Actions workflow (`security.yml`) runs `gitleaks-action` on every PR
and push to `main`.

## Testing strategy

Tests live in `tests/`. No integration tests against the live ASA API — Apple
provides no sandbox.

**auth.test.ts** covers:
- JWT claims: `iss`, `sub`, `aud`, `kid`, `jti`, `iat`, `exp` (~180s lifetime)
- Token exchange: correct `grant_type`, `client_id`, `scope` sent to Apple
- Cache: hit returns same token without a second `fetch`
- Cache: `invalidate()` forces re-fetch
- Cache: expired token triggers re-fetch
- Error: non-2xx from Apple surfaces with HTTP status in message

**client.test.ts** covers:
- 401 retry: two ASA calls made, then auth error surfaced
- 403, 404, 429, 5xx: each maps to a distinct actionable message
- Long error body: truncated at 300 chars
- Happy path: data returned on 200

**tools.test.ts** covers:
- All input schemas: valid input, defaults, rejection of invalid values
- All output schemas: valid shape, nullable fields, enum constraints
- `validateDateRange`: format checks, ordering, edge cases
- `defaultDateRange`: format, ordering, ~30-day span

All tests use `vi.stubGlobal("fetch", ...)` — no real network calls.

## Known limitations

- **Write operations not implemented** — creating, updating, or pausing
  campaigns/ad groups/keywords is out of scope for this release. Write
  operations require a confirmation/dry-run pattern to be safe in an LLM
  context. Tracked for a future phase.
- **Single org** — `org_id` is fixed in the env config. Multi-org support
  (switching org per tool call) is not implemented.
- **Attribution metrics require AdServices** — `tapInstalls` and related
  conversion metrics are only populated if the app has AdServices integrated
  (`SKAdNetwork` or `AdAttributionKit`). Without it, these fields will be null
  even for active campaigns.
- **No automatic pagination** — list tools return one page at a time. The caller
  must increment `offset` to page through large result sets.
- **No impression share** — the impression share endpoint is a separate ASA
  endpoint and is not implemented.
