import { importPKCS8, SignJWT } from "jose";
import type { Config } from "../config.js";

const TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token";
const JWT_AUDIENCE = "https://appleid.apple.com";
// JWT valid for 3 minutes; access token cache lasts until server reports expiry
const JWT_LIFETIME_SECONDS = 180;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Manages ES256 JWT generation and access token caching for ASA API v5. */
export class AsaAuth {
  private cache: CachedToken | null = null;

  constructor(private readonly config: Config) {}

  /** Returns a valid access token, refreshing from Apple if needed. */
  async getAccessToken(): Promise<string> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.accessToken;
    }
    return this.fetchNewToken();
  }

  /** Clears the cached token, forcing a refresh on the next call. */
  invalidate(): void {
    this.cache = null;
  }

  private async fetchNewToken(): Promise<string> {
    const clientAssertion = await this.buildClientAssertion();

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: clientAssertion,
      scope: "searchadsorg",
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token fetch failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    // Subtract 30s buffer to avoid using a token right as it expires
    const expiresAt = Date.now() + (json.expires_in - 30) * 1000;
    this.cache = { accessToken: json.access_token, expiresAt };

    return json.access_token;
  }

  private async buildClientAssertion(): Promise<string> {
    const privateKey = await importPKCS8(this.config.privateKeyPem, "ES256");

    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.config.keyId })
      .setIssuer(this.config.clientId)
      .setSubject(this.config.clientId)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${JWT_LIFETIME_SECONDS}s`)
      .setJti(crypto.randomUUID())
      .sign(privateKey);
  }
}
