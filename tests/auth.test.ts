import { decodeJwt, decodeProtectedHeader } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsaAuth } from "../src/asa/auth.js";
import type { Config } from "../src/config.js";

// Real ES256 private key for tests — never use in production
const TEST_PRIVATE_KEY_PEM =
  "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgIzEDEESw8KNKrgni\nckTlH6GGwjtvzjLi78UiWxeKnLOhRANCAASmwMxMbPmQShjWOZsELAYX927NBVcd\nr/i31GxArb+xm8qgcgO50j8j6YDMbxtSGJHyk4fvQbM2f42LHgKXl2KN\n-----END PRIVATE KEY-----";

const TEST_CONFIG: Config = {
  clientId: "test-client-id",
  teamId: "test-team-id",
  keyId: "test-key-id",
  orgId: "12345",
  privateKeyPem: TEST_PRIVATE_KEY_PEM,
};

// Minimal valid token response from Apple
const FAKE_TOKEN_RESPONSE = {
  access_token: "fake-access-token-abc",
  expires_in: 3600,
  token_type: "Bearer",
};

function makeFetchMock(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

describe("AsaAuth — JWT claims", () => {
  it("generates a JWT with correct claims and header", async () => {
    vi.stubGlobal("fetch", makeFetchMock(FAKE_TOKEN_RESPONSE));

    const auth = new AsaAuth(TEST_CONFIG);

    // Intercept the fetch call to capture the client_assertion JWT
    let capturedAssertion: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const body = new URLSearchParams(init.body as string);
        capturedAssertion = body.get("client_secret");
        return {
          ok: true,
          status: 200,
          json: async () => FAKE_TOKEN_RESPONSE,
          text: async () => "",
        };
      })
    );

    await auth.getAccessToken();

    expect(capturedAssertion).not.toBeNull();
    if (!capturedAssertion) throw new Error("capturedAssertion is null");
    const jwt = capturedAssertion;

    // Verify protected header
    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe(TEST_CONFIG.keyId);

    // Verify payload claims
    const payload = decodeJwt(jwt);
    expect(payload.iss).toBe(TEST_CONFIG.clientId);
    expect(payload.sub).toBe(TEST_CONFIG.clientId);
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti?.length).toBeGreaterThan(0);

    // exp should be ~3 minutes from iat
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    const lifetime = (payload.exp as number) - (payload.iat as number);
    expect(lifetime).toBeGreaterThanOrEqual(170);
    expect(lifetime).toBeLessThanOrEqual(190);

    vi.unstubAllGlobals();
  });

  it("sends correct grant_type, client_id, and scope to token endpoint", async () => {
    let capturedBody: URLSearchParams | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = new URLSearchParams(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => FAKE_TOKEN_RESPONSE,
          text: async () => "",
        };
      })
    );

    const auth = new AsaAuth(TEST_CONFIG);
    await auth.getAccessToken();

    expect(capturedBody?.get("grant_type")).toBe("client_credentials");
    expect(capturedBody?.get("client_id")).toBe(TEST_CONFIG.clientId);
    expect(capturedBody?.get("scope")).toBe("searchadsorg");

    vi.unstubAllGlobals();
  });
});

describe("AsaAuth — token cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cached token without calling fetch again", async () => {
    const fetchMock = makeFetchMock(FAKE_TOKEN_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const auth = new AsaAuth(TEST_CONFIG);

    const token1 = await auth.getAccessToken();
    const token2 = await auth.getAccessToken();

    expect(token1).toBe(FAKE_TOKEN_RESPONSE.access_token);
    expect(token2).toBe(FAKE_TOKEN_RESPONSE.access_token);
    // fetch called once for token exchange — not again on cache hit
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("refreshes the token after invalidate()", async () => {
    const fetchMock = makeFetchMock(FAKE_TOKEN_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const auth = new AsaAuth(TEST_CONFIG);

    await auth.getAccessToken();
    auth.invalidate();
    await auth.getAccessToken();

    // fetch called twice: initial + after invalidation
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("refreshes the token when cache is expired", async () => {
    vi.useFakeTimers();

    const fetchMock = makeFetchMock(FAKE_TOKEN_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const auth = new AsaAuth(TEST_CONFIG);

    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance time past expires_in (3600s) minus the 30s buffer → 3570s
    vi.advanceTimersByTime((3600 - 30 + 1) * 1000);

    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the access token string from the response", async () => {
    vi.stubGlobal("fetch", makeFetchMock(FAKE_TOKEN_RESPONSE));

    const auth = new AsaAuth(TEST_CONFIG);
    const token = await auth.getAccessToken();

    expect(token).toBe(FAKE_TOKEN_RESPONSE.access_token);

    vi.unstubAllGlobals();
  });
});

describe("AsaAuth — error handling", () => {
  it("throws a descriptive error on failed token fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "invalid_client",
        json: async () => ({}),
      })
    );

    const auth = new AsaAuth(TEST_CONFIG);

    await expect(auth.getAccessToken()).rejects.toThrow("401");

    vi.unstubAllGlobals();
  });
});
