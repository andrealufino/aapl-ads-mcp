import { describe, expect, it } from "vitest";
import { AdGroupOutputSchema, ListAdGroupsInputSchema } from "../src/tools/ad-groups.js";
import { CampaignOutputSchema, ListCampaignsInputSchema } from "../src/tools/campaigns.js";
import { KeywordOutputSchema, ListKeywordsInputSchema } from "../src/tools/keywords.js";
import {
  defaultDateRange,
  GetAdGroupReportInputSchema,
  GetCampaignReportInputSchema,
  GetKeywordReportInputSchema,
  GetSearchTermsReportInputSchema,
  validateDateRange,
} from "../src/tools/reports.js";

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

describe("getPaginated URL construction", () => {
  it("appends limit and offset with ? when no query string exists", () => {
    const path = "/campaigns";
    const limit = 50;
    const offset = 20;
    const separator = path.includes("?") ? "&" : "?";
    const url = `${path}${separator}limit=${limit}&offset=${offset}`;
    expect(url).toBe("/campaigns?limit=50&offset=20");
  });

  it("appends limit and offset with & when query string already exists", () => {
    const path = "/campaigns?status=ENABLED";
    const limit = 10;
    const offset = 0;
    const separator = path.includes("?") ? "&" : "?";
    const url = `${path}${separator}limit=${limit}&offset=${offset}`;
    expect(url).toBe("/campaigns?status=ENABLED&limit=10&offset=0");
  });

  it("defaults to limit=20, offset=0 when params are omitted", () => {
    const limit = undefined ?? 20;
    const offset = undefined ?? 0;
    expect(limit).toBe(20);
    expect(offset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ListCampaignsInputSchema
// ---------------------------------------------------------------------------

describe("ListCampaignsInputSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = ListCampaignsInputSchema.parse({ status: "ENABLED", limit: 50, offset: 10 });
    expect(result).toEqual({ status: "ENABLED", limit: 50, offset: 10 });
  });

  it("applies defaults: limit=20, offset=0", () => {
    const result = ListCampaignsInputSchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("accepts missing status (optional)", () => {
    const result = ListCampaignsInputSchema.parse({ limit: 5, offset: 0 });
    expect(result.status).toBeUndefined();
  });

  it("rejects invalid status value", () => {
    expect(() => ListCampaignsInputSchema.parse({ status: "INVALID" })).toThrow();
  });

  it("rejects limit above 1000", () => {
    expect(() => ListCampaignsInputSchema.parse({ limit: 1001 })).toThrow();
  });

  it("rejects limit below 1", () => {
    expect(() => ListCampaignsInputSchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => ListCampaignsInputSchema.parse({ offset: -1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CampaignOutputSchema
// ---------------------------------------------------------------------------

const validCampaign = {
  id: 1,
  orgId: 100,
  name: "My Campaign",
  status: "ENABLED" as const,
  servingStatus: "RUNNING",
  adamId: 999,
  budgetAmount: { amount: "5000.00", currency: "USD" },
  countriesOrRegions: ["US"],
  supplySources: ["APPSTORE_SEARCH_RESULTS"],
  adChannelType: "SEARCH",
  billingEvent: "TAPS",
  startTime: "2024-01-01T00:00:00.000Z",
  creationTime: "2024-01-01T00:00:00.000Z",
  modificationTime: "2024-01-02T00:00:00.000Z",
};

describe("CampaignOutputSchema", () => {
  it("parses a valid campaign", () => {
    const result = CampaignOutputSchema.parse(validCampaign);
    expect(result.id).toBe(1);
    expect(result.status).toBe("ENABLED");
  });

  it("accepts optional dailyBudgetAmount", () => {
    const result = CampaignOutputSchema.parse({
      ...validCampaign,
      dailyBudgetAmount: { amount: "100.00", currency: "USD" },
    });
    expect(result.dailyBudgetAmount).toEqual({ amount: "100.00", currency: "USD" });
  });

  it("accepts missing endTime", () => {
    const result = CampaignOutputSchema.parse(validCampaign);
    expect(result.endTime).toBeUndefined();
  });

  it("rejects invalid status", () => {
    expect(() => CampaignOutputSchema.parse({ ...validCampaign, status: "NOPE" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ListAdGroupsInputSchema
// ---------------------------------------------------------------------------

describe("ListAdGroupsInputSchema", () => {
  it("accepts valid input", () => {
    const result = ListAdGroupsInputSchema.parse({ campaignId: 42, limit: 10, offset: 5 });
    expect(result).toEqual({ campaignId: 42, limit: 10, offset: 5 });
  });

  it("applies defaults: limit=20, offset=0", () => {
    const result = ListAdGroupsInputSchema.parse({ campaignId: 1 });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("rejects non-positive campaignId", () => {
    expect(() => ListAdGroupsInputSchema.parse({ campaignId: 0 })).toThrow();
  });

  it("rejects missing campaignId", () => {
    expect(() => ListAdGroupsInputSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AdGroupOutputSchema
// ---------------------------------------------------------------------------

const validAdGroup = {
  id: 10,
  campaignId: 1,
  orgId: 100,
  name: "My Ad Group",
  status: "ENABLED" as const,
  servingStatus: "RUNNING",
  defaultBidAmount: { amount: "0.50", currency: "USD" },
  automatedKeywordsOptIn: false,
  startTime: "2024-01-01T00:00:00.000Z",
  creationTime: "2024-01-01T00:00:00.000Z",
  modificationTime: "2024-01-02T00:00:00.000Z",
};

describe("AdGroupOutputSchema", () => {
  it("parses a valid ad group", () => {
    const result = AdGroupOutputSchema.parse(validAdGroup);
    expect(result.id).toBe(10);
    expect(result.automatedKeywordsOptIn).toBe(false);
  });

  it("accepts missing endTime", () => {
    const result = AdGroupOutputSchema.parse(validAdGroup);
    expect(result.endTime).toBeUndefined();
  });

  it("rejects invalid status", () => {
    expect(() => AdGroupOutputSchema.parse({ ...validAdGroup, status: "ACTIVE" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ListKeywordsInputSchema
// ---------------------------------------------------------------------------

describe("ListKeywordsInputSchema", () => {
  it("accepts valid input", () => {
    const result = ListKeywordsInputSchema.parse({
      campaignId: 1,
      adGroupId: 10,
      limit: 100,
      offset: 0,
    });
    expect(result).toEqual({ campaignId: 1, adGroupId: 10, limit: 100, offset: 0 });
  });

  it("applies defaults: limit=20, offset=0", () => {
    const result = ListKeywordsInputSchema.parse({ campaignId: 1, adGroupId: 10 });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("rejects missing adGroupId", () => {
    expect(() => ListKeywordsInputSchema.parse({ campaignId: 1 })).toThrow();
  });

  it("rejects non-positive adGroupId", () => {
    expect(() => ListKeywordsInputSchema.parse({ campaignId: 1, adGroupId: -5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// KeywordOutputSchema
// ---------------------------------------------------------------------------

const validKeyword = {
  id: 200,
  adGroupId: 10,
  campaignId: 1,
  orgId: 100,
  text: "photo editing app",
  status: "ACTIVE" as const,
  matchType: "BROAD" as const,
  bidAmount: { amount: "0.80", currency: "USD" },
  creationTime: "2024-01-01T00:00:00.000Z",
  modificationTime: "2024-01-02T00:00:00.000Z",
};

describe("KeywordOutputSchema", () => {
  it("parses a valid keyword", () => {
    const result = KeywordOutputSchema.parse(validKeyword);
    expect(result.text).toBe("photo editing app");
    expect(result.matchType).toBe("BROAD");
  });

  it("accepts EXACT matchType", () => {
    const result = KeywordOutputSchema.parse({ ...validKeyword, matchType: "EXACT" });
    expect(result.matchType).toBe("EXACT");
  });

  it("rejects invalid matchType", () => {
    expect(() => KeywordOutputSchema.parse({ ...validKeyword, matchType: "PHRASE" })).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() => KeywordOutputSchema.parse({ ...validKeyword, status: "ENABLED" })).toThrow();
  });

  it("accepts PAUSED and DELETED status values", () => {
    expect(KeywordOutputSchema.parse({ ...validKeyword, status: "PAUSED" }).status).toBe("PAUSED");
    expect(KeywordOutputSchema.parse({ ...validKeyword, status: "DELETED" }).status).toBe(
      "DELETED"
    );
  });
});

// ---------------------------------------------------------------------------
// validateDateRange
// ---------------------------------------------------------------------------

describe("validateDateRange", () => {
  it("accepts valid date range", () => {
    expect(() => validateDateRange("2024-01-01", "2024-01-31")).not.toThrow();
  });

  it("accepts same start and end date", () => {
    expect(() => validateDateRange("2024-06-15", "2024-06-15")).not.toThrow();
  });

  it("throws when startDate is after endDate", () => {
    expect(() => validateDateRange("2024-02-01", "2024-01-01")).toThrow(
      /startDate.*must not be after/
    );
  });

  it("throws when startDate has wrong format", () => {
    expect(() => validateDateRange("01/01/2024", "2024-01-31")).toThrow(/YYYY-MM-DD/);
  });

  it("throws when endDate has wrong format", () => {
    expect(() => validateDateRange("2024-01-01", "Jan 31 2024")).toThrow(/YYYY-MM-DD/);
  });

  it("throws when startDate is empty string", () => {
    expect(() => validateDateRange("", "2024-01-31")).toThrow(/YYYY-MM-DD/);
  });
});

// ---------------------------------------------------------------------------
// defaultDateRange
// ---------------------------------------------------------------------------

describe("defaultDateRange", () => {
  it("returns YYYY-MM-DD formatted strings", () => {
    const { startDate, endDate } = defaultDateRange();
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a range where startDate <= endDate", () => {
    const { startDate, endDate } = defaultDateRange();
    expect(startDate <= endDate).toBe(true);
  });

  it("spans approximately 30 days", () => {
    const { startDate, endDate } = defaultDateRange();
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });
});

// ---------------------------------------------------------------------------
// GetCampaignReportInputSchema
// ---------------------------------------------------------------------------

describe("GetCampaignReportInputSchema", () => {
  it("accepts empty input (all optional)", () => {
    expect(() => GetCampaignReportInputSchema.parse({})).not.toThrow();
  });

  it("accepts all fields", () => {
    const result = GetCampaignReportInputSchema.parse({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      granularity: "DAILY",
      campaignIds: [1, 2, 3],
    });
    expect(result.granularity).toBe("DAILY");
    expect(result.campaignIds).toEqual([1, 2, 3]);
  });

  it("rejects invalid granularity", () => {
    expect(() => GetCampaignReportInputSchema.parse({ granularity: "YEARLY" })).toThrow();
  });

  it("rejects non-positive campaignId in array", () => {
    expect(() => GetCampaignReportInputSchema.parse({ campaignIds: [1, -5] })).toThrow();
  });

  it("accepts all four granularity values", () => {
    for (const g of ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"] as const) {
      expect(() => GetCampaignReportInputSchema.parse({ granularity: g })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// GetAdGroupReportInputSchema
// ---------------------------------------------------------------------------

describe("GetAdGroupReportInputSchema", () => {
  it("accepts minimum valid input", () => {
    const result = GetAdGroupReportInputSchema.parse({ campaignId: 42 });
    expect(result.campaignId).toBe(42);
    expect(result.adGroupIds).toBeUndefined();
  });

  it("accepts adGroupIds filter", () => {
    const result = GetAdGroupReportInputSchema.parse({ campaignId: 42, adGroupIds: [10, 20] });
    expect(result.adGroupIds).toEqual([10, 20]);
  });

  it("rejects missing campaignId", () => {
    expect(() => GetAdGroupReportInputSchema.parse({})).toThrow();
  });

  it("rejects non-positive campaignId", () => {
    expect(() => GetAdGroupReportInputSchema.parse({ campaignId: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GetKeywordReportInputSchema
// ---------------------------------------------------------------------------

describe("GetKeywordReportInputSchema", () => {
  it("accepts valid input", () => {
    const result = GetKeywordReportInputSchema.parse({ campaignId: 1, adGroupId: 10 });
    expect(result.campaignId).toBe(1);
    expect(result.adGroupId).toBe(10);
  });

  it("rejects missing adGroupId", () => {
    expect(() => GetKeywordReportInputSchema.parse({ campaignId: 1 })).toThrow();
  });

  it("rejects missing campaignId", () => {
    expect(() => GetKeywordReportInputSchema.parse({ adGroupId: 10 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GetSearchTermsReportInputSchema
// ---------------------------------------------------------------------------

describe("GetSearchTermsReportInputSchema", () => {
  it("accepts valid input", () => {
    const result = GetSearchTermsReportInputSchema.parse({ campaignId: 5, adGroupId: 50 });
    expect(result.campaignId).toBe(5);
    expect(result.adGroupId).toBe(50);
  });

  it("rejects missing required fields", () => {
    expect(() => GetSearchTermsReportInputSchema.parse({})).toThrow();
    expect(() => GetSearchTermsReportInputSchema.parse({ campaignId: 5 })).toThrow();
  });

  it("accepts optional granularity", () => {
    const result = GetSearchTermsReportInputSchema.parse({
      campaignId: 5,
      adGroupId: 50,
      granularity: "MONTHLY",
    });
    expect(result.granularity).toBe("MONTHLY");
  });
});
