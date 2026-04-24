import { z } from "zod";
import { config } from "../config.js";
import { shortText } from "../utils/text.js";
import type { ExtractedClaim, ImageCandidate, Modality, SourceDocument, VerifiedImage } from "../types.js";

const HF_CHAT_TIMEOUT_MS = 35_000;
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;
const HF_IMAGE_FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 complementary-health-agent/0.1",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

const PREFERRED_TEXT_MODELS = [
  "Qwen/Qwen2.5-72B-Instruct",
  "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "google/gemma-4-27b-it",
] as const;

const PREFERRED_VISION_MODELS = [
  "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "google/gemma-4-27b-it",
  "Qwen/Qwen3-VL-30B-A3B-Thinking",
] as const;

const MODALITIES = ["ayurveda", "yoga", "pranayama", "acupressure", "mudra", "lifestyle"] as const;

const rawClaimSchema = z.object({
  claims: z.array(
    z.union([
      z.string(),
      z.object({
        remedyCanonical: z.string().optional(),
        name: z.string().optional(),
        remedyAliases: z.array(z.string()).optional(),
        aliases: z.array(z.string()).optional(),
        modality: z.string().optional(),
        targetCondition: z.string().optional(),
        claimedBenefit: z.string().optional(),
        instructionSummary: z.string().optional(),
        rationaleSummary: z.string().optional(),
        safetyNotes: z.array(z.string()).optional(),
      }),
    ]),
  ),
});

const imageSchema = z.object({
  accuracyScore: z.number().min(0).max(1),
  explanation: z.string(),
});

interface HfModelEntry {
  id: string;
  inputModalities: string[];
}

interface HfErrorPayload {
  error?: {
    message?: string;
    code?: string;
    type?: string;
    param?: string;
  };
}

let modelCatalogPromise: Promise<HfModelEntry[]> | null = null;
let cachedTextModel: string | null = null;
let cachedVisionModel: string | null = null;

const extractFirstJsonObject = (value: string): string | null => {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return value.slice(start, end + 1);
  return null;
};

const extractMessageContent = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;

  const textParts = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const typed = item as { type?: string; text?: string };
      return typed.type === "text" ? typed.text ?? null : null;
    })
    .filter((item): item is string => Boolean(item));

  return textParts.join("\n").trim() || null;
};

const parseHfError = (value: string): HfErrorPayload => {
  try {
    return JSON.parse(value) as HfErrorPayload;
  } catch {
    return {};
  }
};

const normalizeModality = (value: string | undefined): Modality | null => {
  if (!value) return null;
  const lowered = value.toLowerCase();
  return MODALITIES.find((item) => item === lowered) ?? null;
};

const inferModality = (query: string, doc: SourceDocument, hint = ""): Modality => {
  const corpus = `${query} ${doc.title} ${doc.snippet} ${hint}`.toLowerCase();
  if (/acupressure|pressure point|pc6|yintang|ht7|li4|baihui|shen men/.test(corpus)) return "acupressure";
  if (/mudra|hand gesture|jnana|gyan|prana mudra|apana vayu/.test(corpus)) return "mudra";
  if (/pranayama|breathing|breathwork|nadi shodhana|bhramari|box breathing/.test(corpus)) return "pranayama";
  if (/asana|pose|balasana|savasana|viparita|yoga/.test(corpus)) return "yoga";
  if (/ayurveda|ayurvedic|ashwagandha|triphala|turmeric|abhyanga/.test(corpus)) return "ayurveda";
  return "lifestyle";
};

const normalizeClaims = (
  query: string,
  doc: SourceDocument,
  payload: string,
): Array<Omit<ExtractedClaim, "evidenceType" | "sourceTier" | "sourceUrl" | "sourceTitle" | "sourceDomain" | "occurrenceWeight" | "querySpecificity">> => {
  const parsed = rawClaimSchema.parse(JSON.parse(payload));

  return parsed.claims.flatMap((item) => {
    const remedyCanonical = typeof item === "string" ? item.trim() : (item.remedyCanonical ?? item.name ?? "").trim();
    if (!remedyCanonical) return [];

    const modality = typeof item === "string"
      ? inferModality(query, doc, remedyCanonical)
      : normalizeModality(item.modality) ?? inferModality(query, doc, remedyCanonical);

    const remedyAliases = typeof item === "string"
      ? []
      : [...new Set([...(item.remedyAliases ?? []), ...(item.aliases ?? [])].filter(Boolean))];

    return [{
      remedyCanonical,
      remedyAliases,
      modality,
      targetCondition: typeof item === "string" ? shortText(query, 120) : item.targetCondition ?? shortText(query, 120),
      claimedBenefit:
        typeof item === "string"
          ? shortText(doc.snippet || `Mentioned for ${query}.`, 220)
          : item.claimedBenefit ?? shortText(doc.snippet || `Mentioned for ${query}.`, 220),
      instructionSummary:
        typeof item === "string"
          ? shortText(doc.text || doc.snippet || `See source text for ${remedyCanonical}.`, 320)
          : item.instructionSummary ?? shortText(doc.text || doc.snippet || `See source text for ${remedyCanonical}.`, 320),
      rationaleSummary:
        typeof item === "string"
          ? shortText(doc.snippet || doc.title, 220)
          : item.rationaleSummary ?? shortText(doc.snippet || doc.title, 220),
      safetyNotes: typeof item === "string" ? [] : item.safetyNotes ?? [],
    }];
  });
};

const isModelUnsupportedError = (status: number, body: string): boolean => {
  if (status !== 400) return false;
  const parsed = parseHfError(body);
  return parsed.error?.code === "model_not_supported" || /not supported by any provider/i.test(body);
};

const listSupportedModels = async (): Promise<HfModelEntry[]> => {
  if (!config.hfToken) return [];
  if (modelCatalogPromise) return modelCatalogPromise;

  modelCatalogPromise = (async () => {
    try {
      const response = await fetch(`${config.hfBaseUrl.replace(/\/$/, "")}/models`, {
        headers: {
          authorization: `Bearer ${config.hfToken}`,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) return [];
      const json = (await response.json()) as {
        data?: Array<{
          id?: string;
          architecture?: { input_modalities?: string[] };
          providers?: Array<{ status?: string }>;
        }>;
      };

      return (json.data ?? [])
        .filter((entry) => entry.id && (entry.providers ?? []).some((provider) => provider.status === "live"))
        .map((entry) => ({
          id: entry.id!,
          inputModalities: entry.architecture?.input_modalities ?? [],
        }));
    } catch {
      return [];
    }
  })();

  return modelCatalogPromise;
};

const buildModelCandidates = async (requestedModel: string | undefined, needsImage: boolean): Promise<string[]> => {
  const supported = await listSupportedModels();
  const supportedIds = new Set(
    supported
      .filter((entry) => (needsImage ? entry.inputModalities.includes("image") : entry.inputModalities.includes("text")))
      .map((entry) => entry.id),
  );

  const configuredCache = needsImage ? cachedVisionModel : cachedTextModel;
  const preferred = needsImage ? [...PREFERRED_VISION_MODELS] : [...PREFERRED_TEXT_MODELS];
  const ordered = [configuredCache, requestedModel, ...preferred, ...supportedIds];
  const filtered = ordered.filter((item): item is string => Boolean(item));
  const deduped = [...new Set(filtered)];

  return supportedIds.size > 0 ? deduped.filter((item) => supportedIds.has(item)) : deduped;
};

const callHfChat = async (
  messages: unknown[],
  requestedModel: string | undefined,
  maxTokens = 900,
  needsImage = false,
): Promise<string | null> => {
  if (!config.hfToken) return null;

  const candidates = await buildModelCandidates(requestedModel, needsImage);
  if (!candidates.length) return null;

  let lastUnsupportedBody: string | null = null;
  for (const model of candidates.slice(0, 5)) {
    try {
      const response = await fetch(`${config.hfBaseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.hfToken}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(HF_CHAT_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: maxTokens,
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        if (isModelUnsupportedError(response.status, body)) {
          lastUnsupportedBody = body;
          continue;
        }

        console.warn(`[HF] ${needsImage ? "vision" : "text"} request failed for model ${model}: ${shortText(body, 240)}`);
        return null;
      }

      const json = JSON.parse(body) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = extractMessageContent(json.choices?.[0]?.message?.content);
      if (!content) return null;

      if (needsImage) cachedVisionModel = model;
      else cachedTextModel = model;
      return content;
    } catch (error) {
      if (error instanceof Error) {
        console.warn(`[HF] ${needsImage ? "vision" : "text"} request failed for model ${model}: ${shortText(error.message, 240)}`);
      }
      return null;
    }
  }

  if (lastUnsupportedBody) {
    console.warn(`[HF] no compatible ${needsImage ? "vision" : "text"} model succeeded: ${shortText(lastUnsupportedBody, 240)}`);
  }
  return null;
};

const maybeInlineImage = async (imageUrl: string): Promise<string> => {
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl;

  try {
    const response = await fetch(imageUrl, {
      headers: HF_IMAGE_FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return imageUrl;

    const contentType = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase() || "";
    if (!contentType.startsWith("image/")) return imageUrl;

    const announcedLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(announcedLength) && announcedLength > MAX_INLINE_IMAGE_BYTES) return imageUrl;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return imageUrl;

    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return imageUrl;
  }
};

export const llmAvailable = (): boolean => Boolean(config.hfToken && config.enableHfTextReasoning);
export const visionAvailable = (): boolean => Boolean(config.hfToken && config.enableHfVisionReasoning);

export const extractClaimsWithLlm = async (
  query: string,
  doc: SourceDocument,
): Promise<Omit<ExtractedClaim, "evidenceType" | "sourceTier" | "sourceUrl" | "sourceTitle" | "sourceDomain" | "occurrenceWeight" | "querySpecificity">[]> => {
  if (!llmAvailable()) return [];

  const prompt = [
    {
      role: "system",
      content:
        "You extract complementary-health remedy mentions from webpage text. Return strict JSON only with shape {\"claims\": [{\"remedyCanonical\": string, \"remedyAliases\": string[], \"modality\": \"ayurveda\"|\"yoga\"|\"pranayama\"|\"acupressure\"|\"mudra\"|\"lifestyle\", \"targetCondition\": string, \"claimedBenefit\": string, \"instructionSummary\": string, \"rationaleSummary\": string, \"safetyNotes\": string[]}]} and no markdown.",
    },
    {
      role: "user",
      content:
        `User query: ${query}\n\n` +
        `Document title: ${doc.title}\nURL: ${doc.url}\n` +
        `Extract up to 8 remedies directly relevant to the query. Keep the tone factual and non-alarming. ` +
        `If the page is not useful, return {\"claims\": []}.\n\n` +
        `Document excerpt:\n${doc.text.slice(0, 12000)}`,
    },
  ];

  const raw = await callHfChat(prompt, config.hfTextModel, 1200, false);
  if (!raw) return [];
  const jsonBlock = extractFirstJsonObject(raw);
  if (!jsonBlock) return [];

  try {
    return normalizeClaims(query, doc, jsonBlock);
  } catch {
    return [];
  }
};

export const verifyImageWithVision = async (
  remedyName: string,
  modality: Modality,
  referenceText: string,
  candidate: ImageCandidate,
): Promise<Pick<VerifiedImage, "accuracyScore" | "explanation"> | null> => {
  if (!visionAvailable()) return null;

  const imageUrl = await maybeInlineImage(candidate.imageUrl);
  const prompt = [
    {
      role: "system",
      content:
        "You verify whether an instructional health-practice image matches a requested remedy. Return strict JSON only with shape {\"accuracyScore\": number, \"explanation\": string}.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `Assess whether this image accurately represents ${remedyName} for modality ${modality}. ` +
            `Use this reference description: ${referenceText}. ` +
            `Prefer accuracy over optimism. Give a score from 0 to 1.`,
        },
        {
          type: "image_url",
          image_url: { url: imageUrl },
        },
      ],
    },
  ];

  const raw = await callHfChat(prompt, config.hfVisionModel, 500, true);
  if (!raw) return null;
  const jsonBlock = extractFirstJsonObject(raw);
  if (!jsonBlock) return null;

  try {
    return imageSchema.parse(JSON.parse(jsonBlock));
  } catch {
    return null;
  }
};
