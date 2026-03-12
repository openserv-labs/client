import fs from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { createTarGzip } from "nanotar";

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

interface TarEntry {
  name: string;
  data: Uint8Array;
}

export interface TarResult {
  buffer: Buffer;
  files: string[];
}

export async function createTarBuffer(dir: string): Promise<TarResult> {
  const ig = ignore();
  ig.add(ALWAYS_EXCLUDE);

  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    ig.add(content);
  }

  const entries = collectEntries(dir, dir, ig);
  const files = entries.map((e) => e.name);

  const gzipped = await createTarGzip(entries);
  return { buffer: Buffer.from(gzipped), files };
}

function collectEntries(
  baseDir: string,
  currentDir: string,
  ig: Ignore,
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
    if (ig.ignores(testPath)) {
      continue;
    }

    if (item.isDirectory()) {
      entries.push(...collectEntries(baseDir, fullPath, ig));
    } else {
      entries.push({
        name: relativePath,
        data: new Uint8Array(fs.readFileSync(fullPath)),
      });
    }
  }

  return entries;
}
