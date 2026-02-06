/**
 * Investigation script for webhook trigger timeout issue
 * Trigger URL: https://api.openserv.ai/webhooks/trigger/491e2eff202949f680fc590828b5de97
 *
 * FINDINGS FROM INITIAL TEST:
 * - The trigger WORKS - returns 200 OK
 * - Response time: ~62 seconds (workflow execution time)
 * - Trigger config:
 *   - timeout: 600 seconds (10 min max)
 *   - waitForCompletion: true (waits for workflow)
 *   - Input schema: { input: string } (required)
 * - Workflow ID: 11004
 * - Latest execution: 452699 (status: completed)
 */

const TRIGGER_URL =
  "https://api.openserv.ai/webhooks/trigger/491e2eff202949f680fc590828b5de97";

interface WorkspaceExecution {
  id: number;
  status: string;
  output?: {
    type: string;
    value: string;
  };
  workspace_id: number;
  started_at: string;
  ended_at: string;
}

interface TriggerResult {
  response: {
    workspaceExecutionId: number;
    action: string;
  };
  trigger: {
    id: string;
    name: string;
    props: {
      timeout: number;
      waitForCompletion: boolean;
      inputSchema?: unknown;
    };
    workspace: {
      id: number;
      execution_state: string;
    };
  };
  workspaceExecution: WorkspaceExecution;
}

interface TriggerResponse {
  status: string;
  results: TriggerResult[];
  error?: string;
}

interface TestResult {
  testName: string;
  input: Record<string, unknown>;
  status: number;
  statusText: string;
  elapsedMs: number;
  executionStatus?: string;
  executionId?: number;
  output?: string;
  error?: string;
}

const results: TestResult[] = [];

async function testTrigger(
  testName: string,
  input: Record<string, unknown>,
  clientTimeoutMs?: number,
  useNdjson?: boolean,
): Promise<TestResult> {
  console.log("\n========================================");
  console.log(`Test: ${testName}`);
  console.log("========================================");
  console.log("Input:", JSON.stringify(input, null, 2));
  if (clientTimeoutMs) {
    console.log(
      "Client timeout:",
      `${clientTimeoutMs}ms (${(clientTimeoutMs / 1000).toFixed(0)}s)`,
    );
  }
  if (useNdjson) {
    console.log("Mode: NDJSON (streaming JSON lines)");
  }
  console.log("----------------------------------------");

  const startTime = Date.now();
  const result: TestResult = {
    testName,
    input,
    status: 0,
    statusText: "",
    elapsedMs: 0,
  };

  // Progress indicator - defined outside try so we can clear it in catch
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  ⏳ Waiting... ${elapsed}s elapsed`);
  }, 1000);

  try {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (clientTimeoutMs) {
      timeoutHandle = setTimeout(() => {
        controller.abort();
      }, clientTimeoutMs);
    }

    // Add ?ndjson query param if requested
    const url = useNdjson ? `${TRIGGER_URL}?ndjson` : TRIGGER_URL;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const headersReceivedAt = Date.now();
    const timeToFirstByte = headersReceivedAt - startTime;

    if (timeoutHandle) clearTimeout(timeoutHandle);

    console.log(
      `\n\n📡 Headers received at ${(timeToFirstByte / 1000).toFixed(2)}s (TTFB)`,
    );
    console.log("─".repeat(70));
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log("  Headers:");
    response.headers.forEach((value, key) => {
      console.log(`    ${key}: ${value}`);
    });
    console.log("─".repeat(70));
    console.log("\n⏳ Reading response body (streaming)...\n");

    result.status = response.status;
    result.statusText = response.statusText;

    // Read response body as stream to log all bytes as they arrive
    const chunks: Uint8Array[] = [];
    const ndjsonLines: string[] = [];
    const reader = response.body?.getReader();

    if (reader) {
      let chunkCount = 0;
      let buffer = ""; // Buffer for incomplete NDJSON lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount++;
        const chunkTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const chunkText = new TextDecoder().decode(value);
        const displayText = chunkText
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");

        // Log each chunk with timestamp
        console.log(
          `\n  📦 Chunk #${chunkCount} at ${chunkTime}s (${value.length} bytes): "${displayText.substring(0, 100)}${displayText.length > 100 ? "..." : ""}"`,
        );

        // For NDJSON, try to parse each line as JSON
        if (useNdjson) {
          buffer += chunkText;
          const lines = buffer.split("\n");
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              ndjsonLines.push(trimmed);
              try {
                const parsed = JSON.parse(trimmed);
                console.log(`      📋 NDJSON: ${JSON.stringify(parsed)}`);
              } catch {
                console.log(`      📋 NDJSON (raw): ${trimmed}`);
              }
            }
          }
        }

        chunks.push(value);
      }

      // Process any remaining buffer content
      if (useNdjson && buffer.trim()) {
        ndjsonLines.push(buffer.trim());
        try {
          const parsed = JSON.parse(buffer.trim());
          console.log(`      📋 NDJSON (final): ${JSON.stringify(parsed)}`);
        } catch {
          console.log(`      📋 NDJSON (final raw): ${buffer.trim()}`);
        }
      }
    }

    // Combine all chunks into final text
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(combined);

    // Now we can stop the progress indicator
    clearInterval(progressInterval);

    // Now measure total time (after body fully received)
    const totalElapsed = Date.now() - startTime;
    result.elapsedMs = totalElapsed;

    console.log(`📊 Response: ${response.status} ${response.statusText}`);
    console.log(
      `⏱️  TTFB: ${(timeToFirstByte / 1000).toFixed(2)}s | Total time: ${(totalElapsed / 1000).toFixed(2)}s`,
    );

    // Show full JSON response
    console.log("\n📄 Full JSON Response:");
    console.log("─".repeat(70));
    try {
      const json = JSON.parse(text) as TriggerResponse;
      console.log(JSON.stringify(json, null, 2));
      console.log("─".repeat(70));

      if (json.results?.[0]) {
        const exec = json.results[0].workspaceExecution;
        result.executionId = exec.id;
        result.executionStatus = exec.status;
        result.output = exec.output?.value;

        // Summary section
        console.log("\n📋 Quick Summary:");
        console.log(`  Execution ID: ${exec.id}`);
        console.log(`  Status: ${exec.status}`);
        console.log(`  Started: ${exec.started_at}`);
        console.log(`  Ended: ${exec.ended_at}`);

        // Calculate workflow duration from timestamps
        if (exec.started_at && exec.ended_at) {
          const workflowDuration =
            (new Date(exec.ended_at).getTime() -
              new Date(exec.started_at).getTime()) /
            1000;
          console.log(`  Workflow duration: ${workflowDuration.toFixed(2)}s`);
        }
      }

      if (json.error) {
        result.error = json.error;
        console.log(`  Error: ${json.error}`);
      }
    } catch {
      console.log(text);
      console.log("─".repeat(70));
      result.error = text.substring(0, 500);
    }

    console.log(response.ok ? "\n✅ Success" : "\n❌ Failed");
  } catch (error) {
    clearInterval(progressInterval); // Stop the progress indicator!

    const elapsed = Date.now() - startTime;
    result.elapsedMs = elapsed;

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        result.error = `Client timeout after ${(elapsed / 1000).toFixed(2)}s`;
        console.log(
          `\n\n⏱️  CLIENT TIMEOUT after ${(elapsed / 1000).toFixed(2)}s`,
        );
        console.log(
          "   This simulates what might happen if a client has a short timeout",
        );
      } else {
        result.error = error.message;
        console.log(`\n\n❌ Error: ${error.message}`);
        console.log(`   Error name: ${error.name}`);
        console.log(`   Time elapsed: ${(elapsed / 1000).toFixed(2)}s`);
        if (error.cause) {
          console.log(`   Cause: ${JSON.stringify(error.cause)}`);
        }
      }
    }
  }

  results.push(result);
  return result;
}

function printUsage(): void {
  console.log(`
Usage: npx tsx test-trigger.ts <input> [timeout_seconds] [--ndjson]

Arguments:
  input            The input text to send to the trigger
  timeout_seconds  Optional client-side timeout in seconds
  --ndjson         Use NDJSON streaming format

Examples:
  npx tsx test-trigger.ts "hello world"
  npx tsx test-trigger.ts "fenerbahce" 200
  npx tsx test-trigger.ts "fenerbahce" 200 --ndjson
  npx tsx test-trigger.ts "test" --ndjson
`);
}

async function main(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(2);
  const useNdjson = args.includes("--ndjson");
  const filteredArgs = args.filter((arg) => arg !== "--ndjson");

  if (
    filteredArgs.length === 0 ||
    args.includes("--help") ||
    args.includes("-h")
  ) {
    printUsage();
    if (
      filteredArgs.length === 0 &&
      !args.includes("--help") &&
      !args.includes("-h")
    ) {
      console.log('Using default input: "test input"\n');
    } else {
      return;
    }
  }

  const testInput = filteredArgs[0] || "test input";
  const clientTimeout = filteredArgs[1]
    ? parseInt(filteredArgs[1], 10) * 1000
    : undefined;

  console.log("🔬 Webhook Trigger Investigation");
  console.log("================================");
  console.log("Time:", new Date().toISOString());
  console.log("URL:", TRIGGER_URL + (useNdjson ? "?ndjson" : ""));

  // Run single test with provided input
  await testTrigger(
    "Custom test",
    { input: testInput },
    clientTimeout,
    useNdjson,
  );

  // Summary
  console.log("\n\n========================================");
  console.log("Summary");
  console.log("========================================");
  for (const r of results) {
    console.log(`\n${r.testName}:`);
    console.log(`  Status: ${r.status} ${r.statusText || r.error || ""}`);
    console.log(`  Time: ${(r.elapsedMs / 1000).toFixed(2)}s`);
    if (r.executionStatus) console.log(`  Execution: ${r.executionStatus}`);
  }
}

main().catch(console.error);
