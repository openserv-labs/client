const BANNER = [
  `  ███████╗███████╗██████╗ ██╗   ██╗`,
  `  ██╔════╝██╔════╝██╔══██╗██║   ██║`,
  `  ███████╗█████╗  ██████╔╝██║   ██║`,
  `  ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝`,
  `  ███████║███████╗██║  ██║ ╚████╔╝`,
  `  ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝`,
];

const TAGLINE = "      OpenServ Platform Client";

function supportsColor(): boolean {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

export function printBanner(): void {
  const color = supportsColor();

  const cyan = color ? "\x1b[38;2;1;254;147;1m" : "";
  const dim = color ? "\x1b[2m" : "";
  const reset = color ? "\x1b[0m" : "";

  console.log();
  for (const line of BANNER) {
    console.log(`${cyan}${line}${reset}`);
  }
  console.log(`${dim}${TAGLINE}${reset}`);
  console.log();
}
