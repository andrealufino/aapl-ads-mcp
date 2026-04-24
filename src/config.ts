import * as fs from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  ASA_CLIENT_ID: z.string().min(1),
  ASA_TEAM_ID: z.string().min(1),
  ASA_KEY_ID: z.string().min(1),
  ASA_ORG_ID: z.string().min(1),
  ASA_PRIVATE_KEY_PATH: z.string().min(1),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }

  const keyPath = parsed.data.ASA_PRIVATE_KEY_PATH;
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Private key file not found: ${keyPath}`);
  }

  const privateKeyPem = fs.readFileSync(keyPath, "utf-8");

  return {
    clientId: parsed.data.ASA_CLIENT_ID,
    teamId: parsed.data.ASA_TEAM_ID,
    keyId: parsed.data.ASA_KEY_ID,
    orgId: parsed.data.ASA_ORG_ID,
    privateKeyPem,
  };
}

export type Config = ReturnType<typeof loadConfig>;

let _config: Config | null = null;

/** Returns the validated config, loading it once on first call. */
export function getConfig(): Config {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}
