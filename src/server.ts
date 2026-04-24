import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHealthTool } from "./tools/index.js";

const SERVER_INFO = {
  name: "aapl-ads-mcp",
  version: "0.1.0",
};

/** Creates and configures the MCP server with all registered tools. */
export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO);

  registerHealthTool(server);

  return server;
}
