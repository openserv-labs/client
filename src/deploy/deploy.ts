import path from "node:path";
import { ApiClient } from "./api-client.js";
import { readEnv, writeContainerId } from "./env.js";
import { logger } from "./logger.js";
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
    logger.info(`Using existing container: ${containerId}`);
    return { id: containerId, isFirstDeploy: false };
  }

  logger.info("Creating new container...");

  const container = await client.createContainer();
  writeContainerId(dir, container.id);
  logger.info(`  Container ID: ${container.id}`);
  logger.info("  Written to .env\n");
  return { id: container.id, isFirstDeploy: true };
}

export async function deploy(targetPath: string): Promise<void> {
  const dir = path.resolve(targetPath);
  logger.info(`Deploying from ${dir}\n`);

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
  let appName: string | undefined;
  if (!isFirstDeploy) {
    try {
      const status = await client.getStatus(targetId);
      currentStatus = status.status;
      appName = status.appName;
      logger.info(`  Current status: ${currentStatus}`);
    } catch {
      // Container might not be reachable yet
    }
  }

  logger.info("\nCreating archive...");
  const { buffer: tarBuffer, files } = await createTarBuffer(dir);
  for (const file of files) {
    logger.info(`  ${file}`);
  }
  logger.info(
    `  ${files.length} files, ${(tarBuffer.length / 1024).toFixed(1)} KB`,
  );

  logger.info("\nUploading files...");
  await client.upload(targetId, tarBuffer);
  logger.info("  Done.");

  const verify = await client.exec(targetId, ["ls", "-la", "/app"], 30);
  if (verify.exitCode === 0) {
    logger.info("  Verified /app contents:");
    for (const line of verify.stdout.split("\n").filter(Boolean)) {
      logger.info(`    ${line}`);
    }
  } else {
    logger.error("  Warning: could not verify upload");
    if (verify.stderr) logger.error(`    ${verify.stderr}`);
  }

  logger.info("\nInstalling dependencies...");
  const installResult = await client.exec(targetId, ["npm", "install"], 600);
  if (installResult.exitCode !== 0) {
    const parts = [`npm install failed (exit code ${installResult.exitCode})`];
    if (installResult.stdout)
      parts.push(`stdout: ${installResult.stdout.slice(0, 500)}`);
    if (installResult.stderr)
      parts.push(`stderr: ${installResult.stderr.slice(0, 500)}`);
    throw new Error(parts.join("\n"));
  }
  logger.info("  Done.");

  const needsStart =
    isFirstDeploy || !currentStatus || currentStatus === "ready";
  if (needsStart) {
    logger.info("\nStarting agent...");
    await client.start(targetId);
    logger.info("  Agent started.");
  } else {
    logger.info("\nRestarting container...");
    await client.restart(targetId);
    logger.info("  Container restarted.");
  }

  let publicUrl: string | undefined;
  if (currentStatus !== "live") {
    logger.info("\nGoing live...");
    const result = await client.goLive(targetId, "continuous");
    publicUrl = result.publicUrl;
    logger.info(`  Public URL: ${publicUrl}`);
  } else {
    if (appName) {
      publicUrl = `https://${appName}.fly.dev`;
    }
    logger.info("\nAlready live.");
  }

  logger.info("\nDeploy complete!");
}
