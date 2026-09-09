import fs from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { createTarGzip } from "nanotar";

// Checked separately from .gitignore so a negation there cannot re-include these
const ALWAYS_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".turbo",
  ".env.example",
  ".env.local",
  ".env.*.local",
];

const ALWAYS_EXCLUDE_EXTENSIONS = [".tsbuildinfo"];

// Root-level files the container needs, uploaded even when .gitignore covers them:
// .env carries the agent's API keys and secrets, .openserv.json its provisioned identity.
const FORCE_INCLUDE = [".env", ".openserv.json"];

interface TarEntry {
  name: string;
  data: Uint8Array;
}

export interface TarResult {
  buffer: Buffer;
  files: string[];
  hasEnv: boolean;
}

export async function createTarBuffer(dir: string): Promise<TarResult> {
  const always = ignore().add(ALWAYS_EXCLUDE);

  const gitIgnored = ignore();
  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    gitIgnored.add(fs.readFileSync(gitignorePath, "utf8"));
  }

  const entries = collectEntries(dir, dir, always, gitIgnored);
  const files = entries.map((e) => e.name);

  const gzipped = await createTarGzip(entries);
  return {
    buffer: Buffer.from(gzipped),
    files,
    hasEnv: files.includes(".env"),
  };
}

function collectEntries(
  baseDir: string,
  currentDir: string,
  always: Ignore,
  gitIgnored: Ignore,
): TarEntry[] {
  const entries: TarEntry[] = [];
  const items = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(currentDir, item.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (ALWAYS_EXCLUDE_EXTENSIONS.some((ext) => item.name.endsWith(ext))) {
      continue;
    }

    const testPath = item.isDirectory() ? `${relativePath}/` : relativePath;
    if (always.ignores(testPath)) {
      continue;
    }
    if (gitIgnored.ignores(testPath) && !FORCE_INCLUDE.includes(relativePath)) {
      continue;
    }

    if (item.isDirectory()) {
      entries.push(...collectEntries(baseDir, fullPath, always, gitIgnored));
    } else {
      entries.push({
        name: relativePath,
        data: new Uint8Array(fs.readFileSync(fullPath)),
      });
    }
  }

  return entries;
}
