import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig } from "./config.js";
import { AsaClient } from "./asa/client.js";
import {
  registerHealthTool,
  registerOrgsTools,
  registerCampaignsTools,
  registerAdGroupsTools,
  registerKeywordsTools,
} from "./tools/index.js";

const SERVER_INFO = {
  name: "aapl-ads-mcp",
  version: "0.1.0",
};

/** Creates and configures the MCP server with all registered tools. */
export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  const client = new AsaClient(getConfig());

  registerHealthTool(server);
  registerOrgsTools(server, client);
  registerCampaignsTools(server, client);
  registerAdGroupsTools(server, client);
  registerKeywordsTools(server, client);

  return server;
}
