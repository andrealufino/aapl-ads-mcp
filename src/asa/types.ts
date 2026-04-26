// ASA API v5 core types

export interface AsaApiResponse<T> {
  data: T;
  pagination?: {
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
  };
  error?: AsaApiError;
}

export interface AsaApiError {
  errors: Array<{
    messageCode: string;
    message: string;
    field?: string;
  }>;
}

export interface Organization {
  orgId: number;
  orgName: string;
  currency: string;
  paymentModel: string;
  roleNames: string[];
  timeZone: string;
}

export interface Campaign {
  id: number;
  orgId: number;
  name: string;
  budgetAmount: Money;
  dailyBudgetAmount?: Money;
  adamId: number;
  status: CampaignStatus;
  servingStatus: string;
  startTime: string;
  endTime?: string;
  countriesOrRegions: string[];
  supplySources: string[];
  adChannelType: string;
  billingEvent: string;
  creationTime: string;
  modificationTime: string;
}

export type CampaignStatus = "ENABLED" | "PAUSED" | "DELETED";

export interface AdGroup {
  id: number;
  campaignId: number;
  orgId: number;
  name: string;
  status: AdGroupStatus;
  servingStatus: string;
  defaultBidAmount: Money;
  startTime: string;
  endTime?: string;
  automatedKeywordsOptIn: boolean;
  creationTime: string;
  modificationTime: string;
}

export type AdGroupStatus = "ENABLED" | "PAUSED" | "DELETED";

export interface Keyword {
  id: number;
  adGroupId: number;
  campaignId: number;
  orgId?: number;
  text: string;
  status: KeywordStatus;
  matchType: KeywordMatchType;
  bidAmount: Money;
  servingStatus?: string;
  creationTime: string;
  modificationTime: string;
}

export type KeywordStatus = "ACTIVE" | "PAUSED" | "DELETED";
export type KeywordMatchType = "BROAD" | "EXACT";

export interface Money {
  amount: string;
  currency: string;
}

export interface ReportMetrics {
  impressions: number;
  taps: number;
  installs: number;
  newDownloads: number;
  redownloads: number;
  latOnInstalls: number;
  latOffInstalls: number;
  ttr: number;
  avgCPT: Money;
  avgCPA: Money;
  spend: Money;
  conversionRate: number;
}

export type Granularity = "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReportRequest {
  startTime: string;
  endTime: string;
  granularity: Granularity;
  selector?: {
    conditions?: Array<{
      field: string;
      operator: string;
      values: string[];
    }>;
    pagination?: {
      offset: number;
      limit: number;
    };
  };
  groupBy?: string[];
  returnGrandTotals?: boolean;
  returnRecordsWithNoMetrics?: boolean;
  returnRowTotals?: boolean;
  timeZone?: string;
}

export interface ReportRow {
  metadata: Record<string, unknown>;
  granularity: Array<{
    date: string;
    metrics: ReportMetrics;
  }>;
  total: ReportMetrics;
}

export interface ReportResponse {
  reportingDataResponse: {
    row: ReportRow[];
    grandTotals?: {
      other: boolean;
      total: ReportMetrics;
    };
  };
}
