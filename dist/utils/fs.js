import fs from "node:fs/promises";
import path from "node:path";
import slugify from "slugify";
export const ensureDir = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
};
export const safeSlug = (value) => slugify(value, { lower: true, strict: true, trim: true }).slice(0, 80) || "query";
export const buildRunDir = (root, query, runId) => path.join(root, `${new Date().toISOString().slice(0, 10)}-${safeSlug(query)}-${runId}`);
