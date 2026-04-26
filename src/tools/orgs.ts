import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AsaClient } from "../asa/client.js";
import type { Organization } from "../asa/types.js";

/** Registers the list_orgs tool — lists all accessible ASA organizations. */
export function registerOrgsTools(server: McpServer, client: AsaClient): void {
  server.tool(
    "list_orgs",
    "List all Apple Search Ads organizations accessible with the configured credentials. Use this as a sanity check for authentication.",
    {},
    async () => {
      const response = await client.get<Organization[]>("/acls");

      const orgs = Array.isArray(response.data) ? response.data : [];

      const result = orgs.map((org) => ({
        orgId: org.orgId,
        orgName: org.orgName,
        currency: org.currency,
        paymentModel: org.paymentModel,
        timeZone: org.timeZone,
        roleNames: org.roleNames,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
