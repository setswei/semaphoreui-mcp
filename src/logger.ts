const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const level: Level = (process.env.MCP_LOG_LEVEL?.toLowerCase() as Level) || "info";

function log(lvl: Level, ...args: unknown[]) {
  if (LEVELS[lvl] >= LEVELS[level]) {
    console.error(`[${lvl.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};
