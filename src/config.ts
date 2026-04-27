import * as fs from "node:fs";
import { z } from "zod";

const envSchema = z
  .object({
    ASA_CLIENT_ID: z.string().min(1),
    ASA_TEAM_ID: z.string().min(1),
    ASA_KEY_ID: z.string().min(1),
    ASA_ORG_ID: z.string().min(1),
    // Provide ONE of these two. ASA_PRIVATE_KEY (inline PEM) takes precedence
    // over ASA_PRIVATE_KEY_PATH (file path). The inline form is preferred for
    // container deployments where mounting a file is impractical.
    ASA_PRIVATE_KEY: z.string().min(1).optional(),
    ASA_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.ASA_PRIVATE_KEY || data.ASA_PRIVATE_KEY_PATH), {
    message:
      "Either ASA_PRIVATE_KEY (inline PKCS#8 PEM) or ASA_PRIVATE_KEY_PATH (absolute file path) must be set",
    path: ["ASA_PRIVATE_KEY"],
  });

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => i.message || i.path.join("."))
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  let privateKeyPem: string;
  if (parsed.data.ASA_PRIVATE_KEY) {
    privateKeyPem = parsed.data.ASA_PRIVATE_KEY;
  } else {
    // refine() above guarantees ASA_PRIVATE_KEY_PATH is set when ASA_PRIVATE_KEY is not.
    const keyPath = parsed.data.ASA_PRIVATE_KEY_PATH as string;
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Private key file not found: ${keyPath}`);
    }
    privateKeyPem = fs.readFileSync(keyPath, "utf-8");
  }

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
