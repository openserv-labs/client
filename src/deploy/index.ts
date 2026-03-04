import { deploy } from "./deploy.js";

const HELP = `
Usage: serv <command> [path]

Commands:
  deploy [path]   Deploy an agent to OpenServ (default path: .)

Options:
  --help, -h      Show this help message

Environment variables (set in .env or shell):
  OPENSERV_USER_API_KEY       Your OpenServ API key (required)
  OPENSERV_CONTAINER_ID       Container ID for redeployment (auto-set after first deploy)
  OPENSERV_ORCHESTRATOR_URL   Custom orchestrator URL (optional)
`.trim();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "deploy": {
      const targetPath = args[1] || ".";
      await deploy(targetPath);
      break;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
