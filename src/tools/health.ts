import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Registers the health check tool — verifies the server is running. */
export function registerHealthTool(server: McpServer): void {
  server.tool(
    "health",
    "Check if the aapl-ads-mcp server is running and reachable. Use this to verify the MCP connection before making API calls. No ASA authentication is required — returns server name, version, and current timestamp.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "ok",
                server: "aapl-ads-mcp",
                version: "0.1.0",
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
