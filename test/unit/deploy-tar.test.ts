import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTarBuffer } from "../../src/cli/deploy/tar";

// The archive deliberately breaks its own .gitignore rule for .env: it is the only way
// to get API keys into the container. Both failure directions are silent, so pin them.
describe("Deploy archive env handling", () => {
  let dir: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "openserv-tar-"));
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    fs.writeFileSync(path.join(dir, ".env"), "ELEVENLABS_API_KEY=secret\n");
    fs.writeFileSync(path.join(dir, ".env.local"), "FOO=bar\n");
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.*\n");
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("uploads .env even when .gitignore covers it", async () => {
    const { files, hasEnv } = await createTarBuffer(dir);

    assert.ok(hasEnv);
    assert.ok(files.includes(".env"));
  });

  it("never uploads local or example env files", async () => {
    const { files } = await createTarBuffer(dir);

    assert.ok(!files.includes(".env.local"));
    assert.ok(!files.includes(".env.example"));
  });
});
