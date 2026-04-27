import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsaClient } from "../src/asa/client.js";
import type { Config } from "../src/config.js";

const TEST_CONFIG: Config = {
  clientId: "SEARCHADS.FAKE-CLIENT-ID",
  teamId: "SEARCHADS.FAKE-TEAM-ID",
  keyId: "FAKE-KEY-ID",
  orgId: "12345",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgIzEDEESw8KNKrgni\nckTlH6GGwjtvzjLi78UiWxeKnLOhRANCAASmwMxMbPmQShjWOZsELAYX927NBVcd\nr/i31GxArb+xm8qgcgO50j8j6YDMbxtSGJHyk4fvQbM2f42LHgKXl2KN\n-----END PRIVATE KEY-----",
};

function makeTokenFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: "fake-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
    text: async () => "",
  });
}

function makeApiFetch(status: number, body = "") {
  return vi.fn().mockImplementation(async (url: string) => {
    if ((url as string).includes("appleid.apple.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "fake-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        text: async () => "",
      };
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
      text: async () => body,
    };
  });
}

describe("AsaClient — error mapping", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a 403 message with role guidance", async () => {
    vi.stubGlobal("fetch", makeApiFetch(403));
    const client = new AsaClient(TEST_CONFIG);
    await expect(client.get("/campaigns")).rejects.toThrow(/403.*User Management/);
  });

  it("throws a 404 message with path and ID guidance", async () => {
    vi.stubGlobal("fetch", makeApiFetch(404));
    const client = new AsaClient(TEST_CONFIG);
    await expect(client.get("/campaigns/999")).rejects.toThrow(/404.*IDs/);
  });

  it("throws a 429 rate-limit message", async () => {
    vi.stubGlobal("fetch", makeApiFetch(429));
    const client = new AsaClient(TEST_CONFIG);
    await expect(client.get("/campaigns")).rejects.toThrow(/rate limit.*429/i);
  });

  it("throws a 500 server error message", async () => {
    vi.stubGlobal("fetch", makeApiFetch(500));
    const client = new AsaClient(TEST_CONFIG);
    await expect(client.get("/campaigns")).rejects.toThrow(/server error.*500/i);
  });

  it("truncates long error bodies at 300 characters", async () => {
    const longBody = "x".repeat(500);
    vi.stubGlobal("fetch", makeApiFetch(422, longBody));
    const client = new AsaClient(TEST_CONFIG);
    const err = await client.get("/campaigns").catch((e) => e as Error);
    expect(err.message.length).toBeLessThan(400);
    expect(err.message).toContain("…");
  });

  it("returns data on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes("appleid.apple.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 3600, token_type: "Bearer" }),
            text: async () => "",
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 1 }], pagination: null }),
          text: async () => "",
        };
      })
    );
    const client = new AsaClient(TEST_CONFIG);
    const result = await client.get<{ id: number }[]>("/campaigns");
    expect(result.data).toEqual([{ id: 1 }]);
  });
});

describe("AsaClient — 401 retry", () => {
  it("retries once on 401 then throws auth error if still 401", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes("appleid.apple.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 3600, token_type: "Bearer" }),
            text: async () => "",
          };
        }
        callCount++;
        return { ok: false, status: 401, json: async () => ({}), text: async () => "" };
      })
    );
    const client = new AsaClient(TEST_CONFIG);
    await expect(client.get("/campaigns")).rejects.toThrow(/authentication failed/i);
    // 2 ASA API calls: original + retry
    expect(callCount).toBe(2);
  });
});
