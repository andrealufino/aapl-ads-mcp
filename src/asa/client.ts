import type { Config } from "../config.js";
import { AsaAuth } from "./auth.js";
import type { AsaApiResponse } from "./types.js";

const BASE_URL = "https://api.searchads.apple.com/api/v5";

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** Low-level HTTP client for ASA API v5 with auth header injection and 401 retry. */
export class AsaClient {
  private readonly auth: AsaAuth;

  constructor(private readonly config: Config) {
    this.auth = new AsaAuth(config);
  }

  async get<T>(path: string): Promise<AsaApiResponse<T>> {
    return this.request<T>("GET", path);
  }

  /**
   * GET with offset-based pagination query params appended to the path.
   * Defaults: limit=20, offset=0.
   */
  async getPaginated<T>(
    path: string,
    pagination: PaginationParams = {}
  ): Promise<AsaApiResponse<T>> {
    const limit = pagination.limit ?? 20;
    const offset = pagination.offset ?? 0;
    const separator = path.includes("?") ? "&" : "?";
    return this.request<T>("GET", `${path}${separator}limit=${limit}&offset=${offset}`);
  }

  async post<T>(path: string, body: unknown): Promise<AsaApiResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetry = false
  ): Promise<AsaApiResponse<T>> {
    const token = await this.auth.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-AP-Context": `orgId=${this.config.orgId}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    // On 401, invalidate the cached token and retry once
    if (response.status === 401 && !isRetry) {
      this.auth.invalidate();
      return this.request<T>(method, path, body, true);
    }

    if (response.status === 429) {
      throw new Error("ASA API rate limit exceeded. Please wait before retrying.");
    }

    if (response.status >= 500) {
      throw new Error(`ASA API server error (${response.status}). Please try again later.`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ASA API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<AsaApiResponse<T>>;
  }
}
