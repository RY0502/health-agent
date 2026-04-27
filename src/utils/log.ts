const formatDetails = (details?: unknown): string => {
  if (details === undefined) return "";
  if (typeof details === "string") return ` ${details}`;
  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return " [unserializable-details]";
  }
};

const stamp = (): string => new Date().toISOString();

export const logInfo = (scope: string, message: string, details?: unknown): void => {
  console.log(`[${stamp()}] [INFO] [${scope}] ${message}${formatDetails(details)}`);
};

export const logWarn = (scope: string, message: string, details?: unknown): void => {
  console.warn(`[${stamp()}] [WARN] [${scope}] ${message}${formatDetails(details)}`);
};

export const logError = (scope: string, message: string, details?: unknown): void => {
  console.error(`[${stamp()}] [ERROR] [${scope}] ${message}${formatDetails(details)}`);
};
