import fs from "node:fs";
import path from "node:path";

interface OpenservJson {
  agents?: Record<string, { id: number; apiKey?: string }>;
  workflows?: Record<string, unknown>;
}

export interface AgentConfig {
  id: number;
  apiKey?: string;
}

export function readAgentConfig(dir: string): AgentConfig | undefined {
  const filePath = path.join(dir, ".openserv.json");
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as OpenservJson;

    if (!data.agents) return undefined;

    const firstAgent = Object.values(data.agents)[0];
    if (!firstAgent) return undefined;

    return { id: firstAgent.id, apiKey: firstAgent.apiKey };
  } catch {
    return undefined;
  }
}
