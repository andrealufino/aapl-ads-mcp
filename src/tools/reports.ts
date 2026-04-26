import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AsaClient } from "../asa/client.js";
import type { Granularity, ReportRequest, ReportResponse } from "../asa/types.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const GranularityEnum = z.enum(["HOURLY", "DAILY", "WEEKLY", "MONTHLY"]);

const MoneySchema = z.object({ amount: z.string(), currency: z.string() }).nullable().optional();

const MetricsSchema = z.object({
  impressions: z.number().nullable().optional(),
  taps: z.number().nullable().optional(),
  installs: z.number().nullable().optional(),
  newDownloads: z.number().nullable().optional(),
  redownloads: z.number().nullable().optional(),
  latOnInstalls: z.number().nullable().optional(),
  latOffInstalls: z.number().nullable().optional(),
  ttr: z.number().nullable().optional(),
  avgCPT: MoneySchema,
  avgCPA: MoneySchema,
  localSpend: MoneySchema,
  conversionRate: z.number().nullable().optional(),
}).passthrough();

const GranularityRowSchema = z.object({
  date: z.string(),
  metrics: MetricsSchema.optional(),
}).passthrough();

const ReportRowSchema = z.object({
  metadata: z.record(z.string(), z.unknown()),
  granularity: z.array(GranularityRowSchema).nullable().optional(),
  total: MetricsSchema.optional(),
}).passthrough();

/** Returns the default date range: [today-30d, today] formatted as YYYY-MM-DD. */
export function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

/** Validates that startDate <= endDate and both are YYYY-MM-DD. Throws on violation. */
export function validateDateRange(startDate: string, endDate: string): void {
  if (!DATE_REGEX.test(startDate)) {
    throw new Error(`startDate must be YYYY-MM-DD, got: ${startDate}`);
  }
  if (!DATE_REGEX.test(endDate)) {
    throw new Error(`endDate must be YYYY-MM-DD, got: ${endDate}`);
  }
  if (startDate > endDate) {
    throw new Error(`startDate (${startDate}) must not be after endDate (${endDate})`);
  }
}

function buildReportBody(
  startDate: string,
  endDate: string,
  granularity: string | undefined,
  defaultSortField: string,
  selector?: ReportRequest["selector"]
): ReportRequest {
  const mergedSelector: ReportRequest["selector"] = {
    orderBy: [{ field: defaultSortField, sortOrder: "ASCENDING" }],
    pagination: { offset: 0, limit: 1000 },
    ...selector,
  };
  const body: ReportRequest = {
    startTime: startDate,
    endTime: endDate,
    groupBy: ["countryOrRegion"],
    returnGrandTotals: true,
    returnRowTotals: true,
    returnRecordsWithNoMetrics: false,
    selector: mergedSelector,
  };
  if (granularity !== undefined) {
    body.granularity = granularity as Granularity;
  }
  return body;
}

function parseReportResponse(raw: unknown): unknown {
  const parsed = z
    .object({
      reportingDataResponse: z.object({
        row: z.array(ReportRowSchema).nullable().optional(),
        grandTotals: z
          .object({
            other: z.boolean().optional(),
            total: MetricsSchema.optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      }).passthrough(),
    })
    .passthrough()
    .parse(raw);
  return parsed;
}

// ---------------------------------------------------------------------------
// Shared input schema fragments
// ---------------------------------------------------------------------------

const dateRangeFields = {
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  granularity: GranularityEnum.optional().describe(
    "Time granularity: HOURLY, DAILY, WEEKLY, MONTHLY. Default: WEEKLY."
  ),
};

// ---------------------------------------------------------------------------
// Input schemas (exported for tests)
// ---------------------------------------------------------------------------

export const GetCampaignReportInputSchema = z.object({
  ...dateRangeFields,
  campaignIds: z
    .array(z.number().int().positive())
    .optional()
    .describe("Filter to specific campaign IDs. Omit for all campaigns."),
});

export const GetAdGroupReportInputSchema = z.object({
  ...dateRangeFields,
  campaignId: z.number().int().positive().describe("Campaign ID to report on."),
  adGroupIds: z
    .array(z.number().int().positive())
    .optional()
    .describe("Filter to specific ad group IDs. Omit for all ad groups in the campaign."),
});

export const GetKeywordReportInputSchema = z.object({
  ...dateRangeFields,
  campaignId: z.number().int().positive().describe("Campaign ID."),
  adGroupId: z.number().int().positive().describe("Ad group ID."),
});

export const GetSearchTermsReportInputSchema = z.object({
  ...dateRangeFields,
  campaignId: z.number().int().positive().describe("Campaign ID."),
  adGroupId: z.number().int().positive().describe("Ad group ID."),
});

export type GetCampaignReportInput = z.infer<typeof GetCampaignReportInputSchema>;
export type GetAdGroupReportInput = z.infer<typeof GetAdGroupReportInputSchema>;
export type GetKeywordReportInput = z.infer<typeof GetKeywordReportInputSchema>;
export type GetSearchTermsReportInput = z.infer<typeof GetSearchTermsReportInputSchema>;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/** Registers all four report tools. */
export function registerReportsTools(server: McpServer, client: AsaClient): void {
  // --- get_campaign_report ---------------------------------------------------

  server.tool(
    "get_campaign_report",
    "Fetch performance metrics (impressions, taps, installs, spend, CPA, CPT, TTR, conversion rate) for Apple Search Ads campaigns. Defaults to the last 30 days with weekly granularity.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      granularity: GranularityEnum.optional().describe(
        "Time granularity: HOURLY, DAILY, WEEKLY, MONTHLY. Default: WEEKLY."
      ),
      campaignIds: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter to specific campaign IDs. Omit for all campaigns."),
    },
    async (args) => {
      const input = GetCampaignReportInputSchema.parse(args);
      const defaults = defaultDateRange();
      const startDate = input.startDate ?? defaults.startDate;
      const endDate = input.endDate ?? defaults.endDate;
      const granularity = input.granularity ?? "WEEKLY";

      validateDateRange(startDate, endDate);

      const selector: ReportRequest["selector"] = input.campaignIds?.length
        ? {
            conditions: [
              {
                field: "campaignId",
                operator: "IN",
                values: input.campaignIds.map(String),
              },
            ],
          }
        : undefined;

      const body = buildReportBody(startDate, endDate, granularity, "campaignId", selector);
      const response = await client.post<ReportResponse>("/reports/campaigns", body);
      const result = parseReportResponse(response.data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // --- get_ad_group_report --------------------------------------------------

  server.tool(
    "get_ad_group_report",
    "Fetch performance metrics for Apple Search Ads ad groups within a campaign. Defaults to the last 30 days with weekly granularity.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      granularity: GranularityEnum.optional().describe(
        "Time granularity: HOURLY, DAILY, WEEKLY, MONTHLY. Default: WEEKLY."
      ),
      campaignId: z.number().int().positive().describe("Campaign ID to report on."),
      adGroupIds: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter to specific ad group IDs. Omit for all ad groups in the campaign."),
    },
    async (args) => {
      const input = GetAdGroupReportInputSchema.parse(args);
      const defaults = defaultDateRange();
      const startDate = input.startDate ?? defaults.startDate;
      const endDate = input.endDate ?? defaults.endDate;
      const granularity = input.granularity ?? "WEEKLY";

      validateDateRange(startDate, endDate);

      const selector: ReportRequest["selector"] = input.adGroupIds?.length
        ? {
            conditions: [
              {
                field: "adGroupId",
                operator: "IN",
                values: input.adGroupIds.map(String),
              },
            ],
          }
        : undefined;

      const body = buildReportBody(startDate, endDate, granularity, "adGroupId", selector);
      const response = await client.post<ReportResponse>(
        `/reports/campaigns/${input.campaignId}/adgroups`,
        body
      );
      const result = parseReportResponse(response.data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // --- get_keyword_report ---------------------------------------------------

  server.tool(
    "get_keyword_report",
    "Fetch performance metrics for targeting keywords in an Apple Search Ads ad group. Defaults to the last 30 days with weekly granularity.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      granularity: GranularityEnum.optional().describe(
        "Time granularity: HOURLY, DAILY, WEEKLY, MONTHLY. Default: WEEKLY."
      ),
      campaignId: z.number().int().positive().describe("Campaign ID."),
      adGroupId: z.number().int().positive().describe("Ad group ID."),
    },
    async (args) => {
      const input = GetKeywordReportInputSchema.parse(args);
      const defaults = defaultDateRange();
      const startDate = input.startDate ?? defaults.startDate;
      const endDate = input.endDate ?? defaults.endDate;
      const granularity = input.granularity ?? "WEEKLY";

      validateDateRange(startDate, endDate);

      // campaignId is already in the URL path — adding it as a condition causes
      // INVALID_CONDITION_INPUT from ASA. Only adGroupId is needed here.
      const selector: ReportRequest["selector"] = {
        conditions: [
          {
            field: "adGroupId",
            operator: "EQUALS",
            values: [String(input.adGroupId)],
          },
        ],
      };

      const body = buildReportBody(startDate, endDate, granularity, "keywordId", selector);
      const response = await client.post<ReportResponse>(
        `/reports/campaigns/${input.campaignId}/keywords`,
        body
      );
      const result = parseReportResponse(response.data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // --- get_search_terms_report ----------------------------------------------

  server.tool(
    "get_search_terms_report",
    "Fetch the real search terms that triggered Apple Search Ads, along with performance metrics. Most valuable for discovering new keywords to add or negate. Defaults to the last 30 days with weekly granularity.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      granularity: GranularityEnum.optional().describe(
        "Time granularity: HOURLY, DAILY, WEEKLY, MONTHLY. Default: WEEKLY."
      ),
      campaignId: z.number().int().positive().describe("Campaign ID."),
      adGroupId: z.number().int().positive().describe("Ad group ID."),
    },
    async (args) => {
      const input = GetSearchTermsReportInputSchema.parse(args);
      const defaults = defaultDateRange();
      const startDate = input.startDate ?? defaults.startDate;
      const endDate = input.endDate ?? defaults.endDate;

      validateDateRange(startDate, endDate);

      // campaignId is already in the URL path. Search terms reports do not
      // support granularity + returnRowTotals simultaneously — omit granularity.
      const selector: ReportRequest["selector"] = {
        conditions: [
          {
            field: "adGroupId",
            operator: "EQUALS",
            values: [String(input.adGroupId)],
          },
        ],
      };

      const body = {
        ...buildReportBody(startDate, endDate, undefined, "searchTermText", selector),
        timeZone: "ORTZ",
      };
      const response = await client.post<ReportResponse>(
        `/reports/campaigns/${input.campaignId}/searchterms`,
        body
      );
      const result = parseReportResponse(response.data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
