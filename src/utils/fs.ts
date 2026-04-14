import fs from "node:fs/promises";
import path from "node:path";
import slugify from "slugify";

export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const safeSlug = (value: string): string =>
  slugify(value, { lower: true, strict: true, trim: true }).slice(0, 80) || "query";

export const buildRunDir = (root: string, query: string, runId: string): string =>
  path.join(root, `${new Date().toISOString().slice(0, 10)}-${safeSlug(query)}-${runId}`);
