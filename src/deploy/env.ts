import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export interface EnvValues {
  apiKey?: string;
  containerId?: string;
  orchestratorUrl?: string;
}

export function readEnv(dir: string): EnvValues {
  const envPath = path.join(dir, ".env");
  const parsed = loadDotenv({ path: envPath });

  const env = parsed.parsed ?? {};

  return {
    apiKey: env.OPENSERV_USER_API_KEY || process.env.OPENSERV_USER_API_KEY,
    containerId: env.OPENSERV_CONTAINER_ID || process.env.OPENSERV_CONTAINER_ID,
    orchestratorUrl:
      env.OPENSERV_ORCHESTRATOR_URL || process.env.OPENSERV_ORCHESTRATOR_URL,
  };
}

export function writeContainerId(dir: string, containerId: string): void {
  const envPath = path.join(dir, ".env");

  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }

  const key = "OPENSERV_CONTAINER_ID";
  const line = `${key}=${containerId}`;
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    content = `${content}${separator}${line}\n`;
  }

  fs.writeFileSync(envPath, content, "utf8");
}
