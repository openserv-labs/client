import path from "node:path";
import { ApiClient } from "./api-client.js";
import { readEnv, writeContainerId } from "./env.js";
import { logger, elapsed } from "./logger.js";
import { createTarBuffer } from "./tar.js";

interface ResolvedContainer {
  id: string;
  isFirstDeploy: boolean;
}

async function resolveContainer(
  client: ApiClient,
  dir: string,
  containerId: string | undefined,
): Promise<ResolvedContainer> {
  if (containerId) {
    logger.step("Resolving container...");
    logger.detail(`Container ID: ${containerId}`);
    return { id: containerId, isFirstDeploy: false };
  }

  const spin = logger.spin("Creating new container...");
  try {
    const container = await client.createContainer();
    writeContainerId(dir, container.id);
    spin.stop(`Container ID: ${container.id}`);
    logger.detail("Written to .env");
    return { id: container.id, isFirstDeploy: true };
  } catch (err) {
    spin.fail("Failed to create container");
    throw err;
  }
}

export async function deploy(targetPath: string): Promise<void> {
  const deployStart = Date.now();
  const dir = path.resolve(targetPath);

  logger.step(`Deploying from ${dir}`);

  const env = readEnv(dir);

  if (!env.apiKey) {
    throw new Error(
      "OPENSERV_USER_API_KEY not found. Set it in your .env file or as an environment variable.",
    );
  }

  const client = new ApiClient({
    apiKey: env.apiKey,
    orchestratorUrl: env.orchestratorUrl,
  });

  const { id: targetId, isFirstDeploy } = await resolveContainer(
    client,
    dir,
    env.containerId,
  );

  let currentStatus: string | undefined;
  if (!isFirstDeploy) {
    try {
      const status = await client.getStatus(targetId);
      currentStatus = status.status;
      logger.detail(`Current status: ${currentStatus}`);
    } catch {
      // Container might not be reachable yet
    }
  }

  logger.step("Creating archive...");
  const { buffer: tarBuffer, files } = await createTarBuffer(dir);
  logger.detail(
    `${files.length} files, ${(tarBuffer.length / 1024).toFixed(1)} KB`,
  );

  const uploadSpin = logger.spin("Uploading files...");
  try {
    await client.upload(targetId, tarBuffer);

    const verify = await client.exec(targetId, ["ls", "-la", "/app"], 30);
    if (verify.exitCode === 0) {
      uploadSpin.stop("Upload verified");
    } else {
      uploadSpin.warn("Could not verify upload");
    }
  } catch (err) {
    uploadSpin.fail("Upload failed");
    throw err;
  }

  const installSpin = logger.spin("Installing dependencies...");
  const installStart = Date.now();
  try {
    const installResult = await client.exec(targetId, ["npm", "install"], 600);
    if (installResult.exitCode !== 0) {
      const msg = `npm install failed (exit code ${installResult.exitCode})`;
      const parts = [msg];
      if (installResult.stdout)
        parts.push(`stdout: ${installResult.stdout.slice(0, 500)}`);
      if (installResult.stderr)
        parts.push(`stderr: ${installResult.stderr.slice(0, 500)}`);
      installSpin.fail(msg);
      throw new Error(parts.join("\n"));
    }
    installSpin.stop(`Done (${elapsed(installStart)})`);
  } catch (err) {
    if (installSpin.isSpinning) installSpin.fail("Install failed");
    throw err;
  }

  if (isFirstDeploy || !currentStatus || currentStatus === "ready") {
    const startSpin = logger.spin("Starting agent...");
    try {
      await client.start(targetId);
      startSpin.stop("Agent started");
    } catch (err) {
      startSpin.fail("Start failed");
      throw err;
    }
  } else {
    const restartSpin = logger.spin("Restarting container...");
    try {
      await client.restart(targetId);
      restartSpin.stop("Container restarted");
    } catch (err) {
      restartSpin.fail("Restart failed");
      throw err;
    }
  }

  const goLiveSpin = logger.spin("Going live...");
  const goLiveStart = Date.now();
  try {
    await client.goLive(targetId, "continuous");
    goLiveSpin.stop(`Done (${elapsed(goLiveStart)})`);
  } catch (err) {
    goLiveSpin.fail("Going live failed");
    throw err;
  }

  logger.success(`Deploy complete! (${elapsed(deployStart)})`);
}
