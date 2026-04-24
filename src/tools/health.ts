import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Registers the health check tool — verifies the server is running. */
export function registerHealthTool(server: McpServer): void {
  server.tool("health", "Check if the aapl-ads-mcp server is running", {}, async () => {
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
  });
}
