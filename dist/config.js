import path from "node:path";
import dotenv from "dotenv";
dotenv.config();
const numberFromEnv = (key, fallback) => {
    const raw = process.env[key];
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const boolFromEnv = (key, fallback) => {
    const raw = process.env[key];
    if (!raw)
        return fallback;
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};
export const config = {
    port: numberFromEnv("PORT", 3017),
    locale: process.env.LOCALE ?? "en-us",
    defaultTopN: numberFromEnv("DEFAULT_TOP_N", 5),
    maxWebResultsPerQuery: numberFromEnv("MAX_WEB_RESULTS_PER_QUERY", 8),
    maxFetchedDocs: numberFromEnv("MAX_FETCHED_DOCS", 40),
    maxImageCandidatesPerRemedy: numberFromEnv("MAX_IMAGE_CANDIDATES_PER_REMEDY", 100),
    outputRoot: process.env.OUTPUT_ROOT ?? path.resolve(process.cwd(), "outputs"),
    usePlaywrightFallback: boolFromEnv("USE_PLAYWRIGHT_FALLBACK", true),
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    textModel: process.env.TEXT_MODEL ?? process.env.OPENAI_MODEL,
    visionModel: process.env.VISION_MODEL,
};
