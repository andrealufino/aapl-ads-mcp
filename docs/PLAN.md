# aapl-ads-mcp — Piano progetto

MCP server TypeScript per Apple Search Ads API. Read-only MVP, transport stdio, repo pubblico su GitHub, licenza MIT.

**Posizione locale**: `/Users/aml/developer/mcp/aapl-ads-mcp/`

---

## Stack & tooling

- **Runtime**: Node 20+ (native fetch, niente `node-fetch`)
- **Linguaggio**: TypeScript strict
- **MCP SDK**: `@modelcontextprotocol/sdk` (ufficiale)
- **JWT**: `jose` — native Web Crypto, zero deps, maintained meglio di `jsonwebtoken`
- **Validation**: `zod` per input dei tool (standard MCP de-facto)
- **Env**: `dotenv` (solo dev locale)
- **Lint/format**: **Biome** — tool unico, zero config, una dipendenza sola
- **Test**: **Vitest**
- **Build**: `tsc` diretto, niente bundler (stdio MCP non ne ha bisogno)
- **Pre-commit**: `lefthook` + `gitleaks` per secret scanning

---

## Struttura progetto

```
aapl-ads-mcp/
├── src/
│   ├── index.ts              # entry point stdio
│   ├── server.ts             # setup MCP + registro tool
│   ├── config.ts             # validazione env con zod
│   ├── asa/
│   │   ├── client.ts         # HTTP client + auth header injection
│   │   ├── auth.ts           # JWT + access token cache
│   │   └── types.ts          # tipi ASA API v5
│   └── tools/
│       ├── index.ts
│       ├── orgs.ts
│       ├── campaigns.ts
│       ├── ad-groups.ts
│       ├── keywords.ts
│       └── reports.ts
├── tests/
│   ├── auth.test.ts
│   └── tools.test.ts
├── docs/
│   └── ARCHITECTURE.md       # tech reference (EN): auth flow, client, tool design, errors
├── .env.example
├── .gitignore
├── biome.json
├── lefthook.yml
├── tsconfig.json
├── package.json
├── LICENSE                   # MIT
├── README.md                 # user-facing (EN): setup, usage, config
├── PLAN.md                   # questo file (IT, interno)
└── CLAUDE.md                 # Claude Code ops guide (EN): commands, conventions, links
```

**Lingua dei file**: tutto in inglese (repo pubblico), tranne `PLAN.md` che resta in italiano (interno, personale, più veloce per te).

- `README.md` → utente random che trova il repo: cosa fa, come si installa, esempio di config
- `docs/ARCHITECTURE.md` → contributor o future-self: flusso auth JWT, design HTTP client, pattern dei tool, convenzioni error handling
- `CLAUDE.md` → Claude Code quando lavora nel repo: comandi (`npm run dev`, `npm test`, `npm run build`), style (Biome, TS strict, no `any`), puntatori a `PLAN.md` e `docs/ARCHITECTURE.md`. Corto, 20-30 righe max.

---

## Auth flow (ASA API v5)

Apple Search Ads usa OAuth `client_credentials` con JWT ES256 come client assertion.

### Setup una-tantum (manuale, documentato nel README)

1. ASA → Account Settings → User Management → crea API user (role Read Only basta per l'MVP)
2. Genera key pair ES256: `openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem`
3. Upload `public-key.pem` in ASA
4. Annota `client_id`, `team_id` (= client_id), `key_id`, `org_id`
5. Metti tutto in `.env`

### Runtime (gestito dal codice)

1. All'avvio: carica private key + credenziali da env
2. Genera JWT firmato ES256: `{iss: client_id, sub: client_id, aud: "https://appleid.apple.com", exp, iat, jti}`
3. POST a `https://appleid.apple.com/auth/oauth2/token` con grant `client_credentials` → access_token
4. Cache in-memory con expiry
5. Ogni API call: `Authorization: Bearer <token>` + `X-AP-Context: orgId=<org_id>`
6. Su 401: invalida cache, rigenera, retry una volta

Access token **mai persistito su disco**. Private key resta dove la metti tu, path in env var.

---

## Tool MVP (read-only)

| Tool | Scopo | Input | Output |
|------|-------|-------|--------|
| `list_orgs` | Sanity check auth, lista org accessibili | — | `{orgId, orgName, currency, paymentModel}[]` |
| `list_campaigns` | Enumera campaigns | `{status?}` | campaign metadata[] |
| `list_ad_groups` | Ad groups di una campaign | `{campaignId}` | ad group metadata[] |
| `list_keywords` | Keywords di un ad group | `{campaignId, adGroupId}` | keyword con bid e match type[] |
| `get_campaign_report` | Metriche per campaign | `{startDate, endDate, campaignIds?, granularity?}` | metriche per periodo |
| `get_ad_group_report` | Metriche per ad group | `{startDate, endDate, campaignId, adGroupIds?}` | metriche |
| `get_keyword_report` | Metriche per keyword | `{startDate, endDate, campaignId, adGroupId}` | metriche |
| `get_search_terms_report` | Search term reali che hanno triggerato ads | `{startDate, endDate, campaignId, adGroupId}` | search terms + metriche |

**Default & convenzioni**:
- Date range default: ultimi 30 giorni (max ASA è 90)
- Granularity default: `WEEKLY`
- Org ID: single-org da env var, non esposto come tool arg nell'MVP
- Metriche standard: `impressions`, `taps`, `installs`, `spend`, `avgCPT`, `avgCPA`, `ttr`, `conversionRate`

Il search terms report è il più prezioso in pratica — è dove scovi keyword da aggiungere o negativizzare.

---

## Security

Non-negoziabile dal commit 0:

- `.gitignore`: `.env`, `*.pem`, `*.key`, `private-key*`, `secrets/`
- `.env.example` con placeholder visibilmente fake (`SEARCHADS.FAKE-CLIENT-ID-EXAMPLE`)
- Pre-commit hook con `gitleaks` via `lefthook`
- Logger configurato per non emettere mai token o key material
- Sezione "Security" in README con warning esplicito su `.env` e `.pem`
- GitHub Action con gitleaks su ogni PR (una volta che il repo vive pubblicamente)

---

## Testing

Test-after, pragmatic. Cosa serve davvero:

**Si testa**
- JWT generation: claims corretti, firma valida, expiry
- Token cache: hit/miss, refresh on expiry, single-flight
- Zod schemas dei tool input: valid pass, invalid produce errori leggibili
- HTTP client error mapping: 401 → refresh+retry, 429 → errore chiaro, 5xx → surface

**Non si testa**
- ASA API reale (nessun sandbox Apple, mock-heavy = zero valore)
- Happy path end-to-end: lo valido a mano in Claude Desktop, più veloce e più realistico

---

## Milestones

| Phase | Contenuto | Effort |
|-------|-----------|--------|
| 0 — Bootstrap | `git init` + commit PLAN.md, scaffold `CLAUDE.md` + `docs/ARCHITECTURE.md` (skeleton), `npm init`, deps, tooling (biome/tsconfig/vitest), `.gitignore`, `.env.example`, server MCP minimale con tool `health`, `claude_desktop_config.json`, verify in Claude Desktop | ~1-2h |
| 1 — Auth | `asa/auth.ts` + JWT + token cache + tool `list_orgs`, unit test JWT | ~2h |
| 2 — Tool di struttura | `list_campaigns`, `list_ad_groups`, `list_keywords`, pagination support | ~3h |
| 3 — Report | `get_campaign_report`, `get_ad_group_report`, `get_keyword_report`, `get_search_terms_report` | ~4h |
| 4 — Polish | README completo (EN), `docs/ARCHITECTURE.md` fill-in (EN), error handling sweep, gitleaks + lefthook, LICENSE, esempi output | ~2-3h |
| 5 — Launch | Repo public, PR su awesome-mcp-servers, post social opzionale | ~1h |

**Totale**: ~14-15h focused, realistici 3-4 serate.

---

## Fuori scope (Phase 2 futura, non adesso)

- **Write operations**: update bid, pause keyword, create/update campaign. Richiedono confirmation pattern e dry-run mode, li aggiungiamo quando Phase 1 è stabile
- **HTTP transport**: se vorrai usarlo da più client in parallelo
- **npm publish**: se il repo prende trazione
- **Multi-org via tool arg**: per ora env var fissa
- **Impression share reports**: endpoint separato, vale solo se ti serve davvero
- **Creative sets / App assets**: overkill per Sheefts

---

## Decisioni chiuse

- **API version**: v5 (attuale)
- **Granularity default report**: `WEEKLY`
- **npm publish**: fuori da Phase 5, rimandato a quando (se) il repo prende trazione

Pronti per Phase 0.

---

## Prossimo step concreto

Sei già in `/Users/aml/developer/mcp/aapl-ads-mcp/`. Flow:

1. Salva questo file come `PLAN.md` nella root del progetto
2. Apri Claude Code nella folder
3. Prompt: *"Leggi PLAN.md e inizia Phase 0"*

In Phase 0 creeremo anche `CLAUDE.md` con una riga tipo *"Riferimento del progetto: vedi PLAN.md"* — così Claude Code ce l'ha come context permanente in ogni sessione futura.
