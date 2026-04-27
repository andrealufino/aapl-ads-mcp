# aapl-ads-mcp

[![Node version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![andrealufino/aapl-ads-mcp MCP server](https://glama.ai/mcp/servers/andrealufino/aapl-ads-mcp/badges/score.svg)](https://glama.ai/mcp/servers/andrealufino/aapl-ads-mcp)

An MCP server that connects Claude (and any MCP-compatible client) to
[Apple Search Ads API v5](https://developer.apple.com/documentation/apple_search_ads).

## What is this

MCP (Model Context Protocol) is an open standard that lets AI assistants call
external tools. This server implements the MCP stdio transport and exposes 9
read-only tools that query your Apple Search Ads account — campaigns, ad groups,
keywords, and performance reports.

You install it once, point Claude Desktop at it, and then ask questions in plain
English: "Which keywords drove the most installs last month?" or "Show me
campaigns with zero impressions this week."

## Why

The official ASA dashboards are good for humans but not for ad-hoc analysis or
automated reporting. Existing MCP alternatives are either SaaS (you hand over
your keys) or unmaintained. This is a self-hosted, open-source option you
control.

## Features

- **list_orgs** — verify authentication, list accessible organizations
- **list_campaigns** — enumerate campaigns, optionally filter by status
- **list_ad_groups** — ad groups for a given campaign
- **list_keywords** — targeting keywords with bid amounts and match type
- **get_campaign_report** — impressions, taps, installs, spend, CPI, TTR by campaign
- **get_ad_group_report** — same metrics broken down by ad group
- **get_keyword_report** — per-keyword performance with weekly/daily/monthly granularity
- **get_search_terms_report** — the real search queries that triggered your ads (most useful for discovery)

All tools default to the last 30 days. Reports support `HOURLY`, `DAILY`,
`WEEKLY`, and `MONTHLY` granularity.

## Limitations
- **Read-only by design.** No write operations (create, update, pause) in this release.
- **Requires Apple Search Ads Campaign Management API access.** You need to create an API user in your ASA account and generate an ES256 key pair.
- **Aggregate install metrics work without app-side integration.** `tapInstalls`, `viewInstalls`, and related fields in ASA reports are populated by Apple Search Ads directly and do not require any SDK in your app. AdServices / [AdAttributionKit](https://developer.apple.com/documentation/adattributionkit)is only needed if you want to attribute installs to specific campaigns from inside your app (e.g. for onboarding personalization).
- **Single organization.** The org ID is fixed in the config. Multi-org switching is not implemented.

## Setup

### 1. Generate an ES256 key pair

Use the modern `genpkey` command — it produces PKCS#8 format directly, which is what this server requires. The older `ecparam -genkey` produces SEC1 format and will cause a startup error.

```bash
# Generate private key (PKCS#8)
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private-key.pem

# Derive public key
openssl pkey -in private-key.pem -pubout -out public-key.pem
```

Verify the private key starts with `-----BEGIN PRIVATE KEY-----` (not `-----BEGIN EC PRIVATE KEY-----`). If it starts with the EC variant, convert it:

```bash
openssl pkcs8 -topk8 -nocrypt -in ec-key.pem -out private-key.pem
```

Store `private-key.pem` outside the repository root if possible (e.g. `~/.ssh/asa-private-key.pem`).

### 2. Create an API user in Apple Search Ads

1. Go to **ASA → Account Settings → User Management**
2. Click **Create User**, choose role **API Account Read Only** for read-only usage (recommended for this server). **API Campaign Manager** is also fine and adds write permissions if you plan to extend the server with write tools later.
3. Go to the **API** tab, click **Create Client**
4. Upload `public-key.pem`
5. Copy `client_id`, `team_id`, and `key_id` from the confirmation screen
6. Find your `org_id` in **Account Settings → Overview**

### 3. Clone and build

```bash
git clone https://github.com/andrealufino/aapl-ads-mcp.git
cd aapl-ads-mcp
npm install
npm run build
```

### 4. Configure Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aapl-ads": {
      "command": "node",
      "args": ["/absolute/path/to/aapl-ads-mcp/dist/index.js"],
      "env": {
        "ASA_CLIENT_ID": "SEARCHADS.your-client-id-here",
```
    "ASA_TEAM_ID": "SEARCHADS.your-team-id-here",
    "ASA_KEY_ID": "your-key-id-here",
    "ASA_ORG_ID": "12345678",
    "ASA_PRIVATE_KEY_PATH": "/absolute/path/to/private-key.pem"
  }
}
```

} }

```

**Note:** `ASA_PRIVATE_KEY_PATH` must be an absolute path. Tilde (`~`) is not
expanded by Node.js — use the full path.

For container or cloud deployments where mounting a file is impractical, set
`ASA_PRIVATE_KEY` to the inline PEM contents instead (newlines preserved). If
both are set, `ASA_PRIVATE_KEY` wins.

Restart Claude Desktop. Ask "run health check" to verify the server is
connected.

## Usage examples

These are natural-language prompts that work with Claude Desktop once the server
is running:
```

List my Apple Ads campaigns

```
```
```
Show me the last 30 days of campaign performance
```

```
Which keywords drove installs in my Brand campaign last week?
```

```
What search terms triggered my ads in the past month? Focus on ones
with impressions but no installs.
```

```
Compare weekly spend across all campaigns for Q1 2025
```

```
Show ad groups in campaign 1234567890 with their bid amounts
```

## Development

```bash
npm run build      # compile TypeScript
npm test           # run test suite (Vitest)
npm run typecheck  # type-check without emitting
npm run lint       # Biome lint
npm run format     # Biome format (write)
```

### MCP Inspector

To debug tool calls interactively without Claude Desktop:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Set the env vars in the Inspector UI before connecting.

### Pre-commit hooks

Install lefthook hooks locally after cloning:

```bash
npx lefthook install
```

This sets up:
- `gitleaks protect --staged` — blocks commits that contain secrets
- Biome lint check on staged `.ts` files
- TypeScript type check

## Contributing

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for technical details: auth
flow, HTTP client design, tool pattern, report schema quirks, and ASA v5
lessons learned during development.

Bug reports and pull requests welcome.

## Security

- Never commit `.env` or `*.pem` files — both are in `.gitignore`
- Keep `private-key.pem` outside the repository root
- The access token is held in memory only, never written to disk
- If you suspect a key has been exposed, rotate it in **ASA → Account Settings → API**

## License

MIT — see [LICENSE](LICENSE).
