import { env, pipeline } from "@huggingface/transformers";
import { config } from "../../config.js";

const NEGATIVE_LABEL_TERMS = [
  "web site",
  "website",
  "comic book",
  "book jacket",
  "envelope",
  "scoreboard",
  "digital clock",
  "monitor",
  "screen",
  "flagpole",
  "crossword puzzle",
  "packet",
  "menu",
  "slot",
];

const NEUTRAL_IMAGE_SCORE = 0.55;

let classifierPromise: Promise<any> | null = null;
const TRANSFORMERS_TIMEOUT_MS = 5000;

const enabled = (): boolean => {
  const raw = process.env.ENABLE_TRANSFORMERS_IMAGE_CHECK;
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> =>
  await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("transformers timeout")), ms)),
  ]);

const getClassifier = async () => {
  if (!enabled()) return null;
  if (process.env.HF_TRANSFORMERS_CACHE) {
    env.cacheDir = process.env.HF_TRANSFORMERS_CACHE;
  }
  if (!classifierPromise) {
    classifierPromise = pipeline("image-classification", "Xenova/vit-base-patch16-224");
  }
  return await withTimeout(classifierPromise, TRANSFORMERS_TIMEOUT_MS);
};

export interface TransformersImageCheckResult {
  score: number;
  labels: string[];
  explanation: string;
}

export const runTransformersImageCheck = async (imageUrl: string): Promise<TransformersImageCheckResult | null> => {
  try {
    const classifier = await getClassifier();
    if (!classifier) return null;
    const output = await withTimeout(classifier(imageUrl, { top_k: 5 }), TRANSFORMERS_TIMEOUT_MS);
    const labels = (Array.isArray(output) ? output : []).map((item: { label: string; score: number }) => `${item.label}:${item.score.toFixed(3)}`);
    const penalty = (Array.isArray(output) ? output : []).reduce((acc: number, item: { label: string; score: number }) => {
      const label = item.label.toLowerCase();
      return NEGATIVE_LABEL_TERMS.some((term) => label.includes(term)) ? acc + item.score : acc;
    }, 0);

    const score = Math.max(0, Math.min(1, NEUTRAL_IMAGE_SCORE - penalty));
    return {
      score,
      labels,
      explanation: `transformers.js (${config.visionModel ? "with external vision also enabled" : "local only"}) labels=${labels.join(", ")}`,
    };
  } catch {
    return null;
  }
};
