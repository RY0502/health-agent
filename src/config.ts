import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export interface AgentConfig {
  port: number;
  locale: string;
  defaultTopN: number;
  maxWebResultsPerQuery: number;
  maxFetchedDocs: number;
  maxImageCandidatesPerRemedy: number;
  outputRoot: string;
  usePlaywrightFallback: boolean;
  hfToken?: string;
  hfBaseUrl: string;
  hfTextModel?: string;
  hfVisionModel?: string;
  enableHfTextReasoning: boolean;
  enableHfVisionReasoning: boolean;
}

const numberFromEnv = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolFromEnv = (key: string, fallback: boolean) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

export const config: AgentConfig = {
  port: numberFromEnv("PORT", 3017),
  locale: process.env.LOCALE ?? "en-us",
  defaultTopN: numberFromEnv("DEFAULT_TOP_N", 5),
  maxWebResultsPerQuery: numberFromEnv("MAX_WEB_RESULTS_PER_QUERY", 8),
  maxFetchedDocs: numberFromEnv("MAX_FETCHED_DOCS", 250),
  maxImageCandidatesPerRemedy: numberFromEnv("MAX_IMAGE_CANDIDATES_PER_REMEDY", 250),
  outputRoot: process.env.OUTPUT_ROOT ?? path.resolve(process.cwd(), "outputs"),
  usePlaywrightFallback: boolFromEnv("USE_PLAYWRIGHT_FALLBACK", true),
  hfToken: process.env.HF_TOKEN,
  hfBaseUrl: process.env.HF_BASE_URL ?? "https://router.huggingface.co/v1",
  hfTextModel: process.env.HF_TEXT_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  hfVisionModel: process.env.HF_VISION_MODEL ?? "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  enableHfTextReasoning: boolFromEnv("ENABLE_HF_TEXT_REASONING", true),
  enableHfVisionReasoning: boolFromEnv("ENABLE_HF_VISION_REASONING", true),
};
