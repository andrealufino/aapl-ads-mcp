import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AsaClient } from "../asa/client.js";
import type { Keyword } from "../asa/types.js";

export const ListKeywordsInputSchema = z.object({
  campaignId: z.number().int().positive().describe("Campaign ID"),
  adGroupId: z.number().int().positive().describe("Ad group ID to list keywords for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(20)
    .describe("Max results to return (1–1000)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Zero-based offset for pagination"),
});

const MoneySchema = z.object({ amount: z.string(), currency: z.string() }).nullable();

export const KeywordOutputSchema = z.object({
  id: z.number(),
  adGroupId: z.number(),
  campaignId: z.number(),
  orgId: z.number().optional(),
  text: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "DELETED"]),
  matchType: z.enum(["BROAD", "EXACT"]),
  bidAmount: MoneySchema,
  servingStatus: z.string().optional(),
  creationTime: z.string(),
  modificationTime: z.string(),
});

export type ListKeywordsInput = z.infer<typeof ListKeywordsInputSchema>;
export type KeywordOutput = z.infer<typeof KeywordOutputSchema>;

/** Registers the list_keywords tool. */
export function registerKeywordsTools(server: McpServer, client: AsaClient): void {
  server.tool(
    "list_keywords",
    "List targeting keywords for a specific Apple Search Ads ad group. Requires ASA authentication; read-only. Returns keyword metadata (text, match type BROAD/EXACT, bid amount, status) but not performance metrics — use get_keyword_report for metrics. Supports pagination via limit/offset; default limit 20, max 1000.",
    {
      campaignId: z
        .number()
        .int()
        .positive()
        .describe("ID of the campaign that contains the ad group. Obtain from list_campaigns."),
      adGroupId: z
        .number()
        .int()
        .positive()
        .describe("ID of the ad group whose keywords to list. Obtain from list_ad_groups."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Max keywords to return (1–1000). Defaults to 20."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Zero-based page offset for pagination. Defaults to 0."),
    },
    async (args) => {
      const { campaignId, adGroupId, limit, offset } = ListKeywordsInputSchema.parse(args);

      const response = await client.getPaginated<Keyword[]>(
        `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords`,
        { limit, offset }
      );
      const keywords = Array.isArray(response.data) ? response.data : [];

      const result = {
        pagination: response.pagination,
        keywords: keywords.map((kw) => KeywordOutputSchema.parse(kw)),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
