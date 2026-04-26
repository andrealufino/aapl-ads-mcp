import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AsaClient } from "../asa/client.js";
import type { AdGroup } from "../asa/types.js";

export const ListAdGroupsInputSchema = z.object({
  campaignId: z.number().int().positive().describe("Campaign ID to list ad groups for"),
  limit: z.number().int().min(1).max(1000).optional().default(20).describe("Max results to return (1–1000)"),
  offset: z.number().int().min(0).optional().default(0).describe("Zero-based offset for pagination"),
});

const MoneySchema = z.object({ amount: z.string(), currency: z.string() }).nullable();

export const AdGroupOutputSchema = z.object({
  id: z.number(),
  campaignId: z.number(),
  orgId: z.number(),
  name: z.string(),
  status: z.enum(["ENABLED", "PAUSED", "DELETED"]),
  servingStatus: z.string().nullable(),
  defaultBidAmount: MoneySchema,
  automatedKeywordsOptIn: z.boolean(),
  startTime: z.string(),
  endTime: z.string().nullable().optional(),
  creationTime: z.string(),
  modificationTime: z.string(),
});

export type ListAdGroupsInput = z.infer<typeof ListAdGroupsInputSchema>;
export type AdGroupOutput = z.infer<typeof AdGroupOutputSchema>;

/** Registers the list_ad_groups tool. */
export function registerAdGroupsTools(server: McpServer, client: AsaClient): void {
  server.tool(
    "list_ad_groups",
    "List ad groups for a given Apple Search Ads campaign.",
    {
      campaignId: z.number().int().positive().describe("Campaign ID to list ad groups for"),
      limit: z.number().int().min(1).max(1000).optional().describe("Max results to return (1–1000, default 20)"),
      offset: z.number().int().min(0).optional().describe("Zero-based offset for pagination (default 0)"),
    },
    async (args) => {
      const { campaignId, limit, offset } = ListAdGroupsInputSchema.parse(args);

      const response = await client.getPaginated<AdGroup[]>(
        `/campaigns/${campaignId}/adgroups`,
        { limit, offset }
      );
      const adGroups = Array.isArray(response.data) ? response.data : [];

      const result = {
        pagination: response.pagination,
        adGroups: adGroups.map((ag) => AdGroupOutputSchema.parse(ag)),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
