import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AsaClient } from "../asa/client.js";
import type { Campaign } from "../asa/types.js";

export const ListCampaignsInputSchema = z.object({
  status: z.enum(["ENABLED", "PAUSED", "DELETED"]).optional().describe("Filter by campaign status"),
  limit: z.number().int().min(1).max(1000).optional().default(20).describe("Max results to return (1–1000)"),
  offset: z.number().int().min(0).optional().default(0).describe("Zero-based offset for pagination"),
});

const MoneySchema = z.object({ amount: z.string(), currency: z.string() }).nullable();

export const CampaignOutputSchema = z.object({
  id: z.number(),
  orgId: z.number(),
  name: z.string(),
  status: z.enum(["ENABLED", "PAUSED", "DELETED"]),
  servingStatus: z.string().nullable(),
  adamId: z.number(),
  budgetAmount: MoneySchema,
  dailyBudgetAmount: MoneySchema.optional(),
  countriesOrRegions: z.array(z.string()),
  supplySources: z.array(z.string()),
  adChannelType: z.string(),
  billingEvent: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable().optional(),
  creationTime: z.string(),
  modificationTime: z.string(),
});

export type ListCampaignsInput = z.infer<typeof ListCampaignsInputSchema>;
export type CampaignOutput = z.infer<typeof CampaignOutputSchema>;

/** Registers the list_campaigns tool. */
export function registerCampaignsTools(server: McpServer, client: AsaClient): void {
  server.tool(
    "list_campaigns",
    "List Apple Search Ads campaigns for the configured organization. Optionally filter by status.",
    {
      status: z.enum(["ENABLED", "PAUSED", "DELETED"]).optional().describe("Filter by campaign status"),
      limit: z.number().int().min(1).max(1000).optional().describe("Max results to return (1–1000, default 20)"),
      offset: z.number().int().min(0).optional().describe("Zero-based offset for pagination (default 0)"),
    },
    async (args) => {
      const { status, limit, offset } = ListCampaignsInputSchema.parse(args);

      let path = "/campaigns";
      if (status !== undefined) {
        path += `?status=${status}`;
      }

      const response = await client.getPaginated<Campaign[]>(path, { limit, offset });
      const campaigns = Array.isArray(response.data) ? response.data : [];

      const result = {
        pagination: response.pagination,
        campaigns: campaigns.map((c) => CampaignOutputSchema.parse(c)),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
