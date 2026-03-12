function supportsColor(): boolean {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stderr.isTTY === true || process.stdout.isTTY === true;
}

const color = supportsColor();
const isTTY = process.stdout.isTTY === true;

const green = color ? "\x1b[38;2;1;254;147;1m" : "";
const red = color ? "\x1b[1;31m" : "";
const yellow = color ? "\x1b[1;33m" : "";
const dim = color ? "\x1b[2m" : "";
const reset = color ? "\x1b[0m" : "";
const clearLine = "\x1b[2K\r";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;

  constructor(private msg: string) {
    if (isTTY) {
      process.stdout.write(`\n${green}  ${frames[0]} ${msg}${reset}`);
      this.timer = setInterval(() => {
        this.i++;
        const frame = frames[this.i % frames.length];
        process.stdout.write(
          `${clearLine}${green}  ${frame} ${this.msg}${reset}`,
        );
      }, 80);
    } else {
      console.log(`\n  => ${msg}`);
    }
  }

  get isSpinning(): boolean {
    return this.timer !== null;
  }

  private clear(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (isTTY) {
      process.stdout.write(clearLine);
    }
  }

  stop(detail?: string): void {
    this.clear();
    console.log(`${green}  => ${this.msg}${reset}`);
    if (detail) {
      console.log(`${dim}     ${detail}${reset}`);
    }
  }

  fail(msg: string): void {
    this.clear();
    console.error(`${red}  ✖ ${msg}${reset}`);
  }

  warn(msg: string): void {
    this.clear();
    console.log(`${green}  => ${this.msg}${reset}`);
    console.warn(`${yellow}     ⚠ ${msg}${reset}`);
  }
}

export const logger = {
  step: (msg: string) => console.log(`\n${green}  => ${msg}${reset}`),
  detail: (msg: string) => console.log(`${dim}     ${msg}${reset}`),
  success: (msg: string) => console.log(`\n${green}  ✔ ${msg}${reset}`),
  warn: (msg: string) => console.warn(`${yellow}     ⚠ ${msg}${reset}`),
  error: (msg: string) => console.error(`${red}  ✖ ${msg}${reset}`),
  info: (...args: unknown[]) => console.log(...args),
  spin: (msg: string) => new Spinner(msg),
};

export function elapsed(startMs: number): string {
  const sec = (Date.now() - startMs) / 1000;
  return sec < 1 ? `${(sec * 1000).toFixed(0)}ms` : `${sec.toFixed(1)}s`;
}
