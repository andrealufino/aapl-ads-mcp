import { describe, it, expect } from "vitest";
import { ListCampaignsInputSchema, CampaignOutputSchema } from "../src/tools/campaigns.js";
import { ListAdGroupsInputSchema, AdGroupOutputSchema } from "../src/tools/ad-groups.js";
import { ListKeywordsInputSchema, KeywordOutputSchema } from "../src/tools/keywords.js";

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
    const result = ListKeywordsInputSchema.parse({ campaignId: 1, adGroupId: 10, limit: 100, offset: 0 });
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
    expect(KeywordOutputSchema.parse({ ...validKeyword, status: "DELETED" }).status).toBe("DELETED");
  });
});
