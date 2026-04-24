# aapl-ads-mcp

MCP server for [Apple Search Ads API v5](https://developer.apple.com/documentation/apple_search_ads). Lets Claude and other MCP clients query your ASA campaigns, ad groups, keywords, and performance reports.

Read-only. Stdio transport. No external databases.

## Requirements

- Node.js 20+
- An Apple Search Ads account with API access

## Setup

### 1. Create an API key in Apple Search Ads

1. Go to **ASA → Account Settings → User Management → API**
2. Create a user with **Read Only** role
3. Generate an ES256 key pair:
   ```bash
   openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem
   openssl ec -in private-key.pem -pubout -out public-key.pem
   ```
4. Upload `public-key.pem` to ASA
5. Note your `client_id`, `team_id`, `key_id`, and `org_id`

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
ASA_CLIENT_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_TEAM_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_KEY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_ORG_ID=12345678
ASA_PRIVATE_KEY_PATH=/path/to/private-key.pem
```

### 3. Build

```bash
npm install
npm run build
```

### 4. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aapl-ads": {
      "command": "node",
      "args": ["/absolute/path/to/aapl-ads-mcp/dist/index.js"],
      "env": {
        "ASA_CLIENT_ID": "SEARCHADS.xxx",
        "ASA_TEAM_ID": "SEARCHADS.xxx",
        "ASA_KEY_ID": "xxx",
        "ASA_ORG_ID": "12345678",
        "ASA_PRIVATE_KEY_PATH": "/absolute/path/to/private-key.pem"
      }
    }
  }
}
```

Restart Claude Desktop. The `health` tool should appear.

## Available Tools

| Tool | Description |
|------|-------------|
| `health` | Verify the server is running |
| `list_orgs` | List accessible organizations |
| `list_campaigns` | List campaigns (filter by status) |
| `list_ad_groups` | List ad groups for a campaign |
| `list_keywords` | List keywords for an ad group |
| `get_campaign_report` | Performance metrics by campaign |
| `get_ad_group_report` | Performance metrics by ad group |
| `get_keyword_report` | Performance metrics by keyword |
| `get_search_terms_report` | Real search terms that triggered ads |

> Tools beyond `health` are available from Phase 1 onward.

## Security

**Never commit `.env` or `.pem` files.** Both are in `.gitignore` by default.

Keep your `private-key.pem` outside the repository root if possible. The access token fetched at runtime is held in memory only — never written to disk.

If you suspect a key has been exposed, rotate it immediately in ASA → Account Settings → API.

## License

MIT
