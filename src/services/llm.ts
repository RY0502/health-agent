import { z } from "zod";
import { config } from "../config.js";
import type { ExtractedClaim, ImageCandidate, Modality, SourceDocument, VerifiedImage } from "../types.js";

const claimSchema = z.object({
  claims: z.array(
    z.object({
      remedyCanonical: z.string(),
      remedyAliases: z.array(z.string()).default([]),
      modality: z.enum(["ayurveda", "yoga", "pranayama", "acupressure", "mudra", "lifestyle"]),
      targetCondition: z.string(),
      claimedBenefit: z.string(),
      instructionSummary: z.string(),
      rationaleSummary: z.string(),
      safetyNotes: z.array(z.string()).default([]),
    }),
  ),
});

const imageSchema = z.object({
  accuracyScore: z.number().min(0).max(1),
  explanation: z.string(),
});

const extractFirstJsonObject = (value: string): string | null => {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return value.slice(start, end + 1);
  return null;
};

const callHfChat = async (messages: unknown[], model: string, maxTokens = 900): Promise<string | null> => {
  if (!config.hfToken) return null;
  const response = await fetch(`${config.hfBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.hfToken}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? null;
};

export const llmAvailable = (): boolean => Boolean(config.hfToken && config.hfTextModel && config.enableHfTextReasoning);
export const visionAvailable = (): boolean => Boolean(config.hfToken && config.hfVisionModel && config.enableHfVisionReasoning);

export const extractClaimsWithLlm = async (
  query: string,
  doc: SourceDocument,
): Promise<Omit<ExtractedClaim, "evidenceType" | "sourceTier" | "sourceUrl" | "sourceTitle" | "sourceDomain" | "occurrenceWeight" | "querySpecificity">[]> => {
  if (!llmAvailable() || !config.hfTextModel) return [];

  const prompt = [
    {
      role: "system",
      content:
        "You extract complementary-health remedy mentions from webpage text. Return strict JSON only with shape {\"claims\": [...]} and no markdown.",
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

  const raw = await callHfChat(prompt, config.hfTextModel, 1200);
  if (!raw) return [];
  const jsonBlock = extractFirstJsonObject(raw);
  if (!jsonBlock) return [];

  try {
    const parsed = claimSchema.parse(JSON.parse(jsonBlock));
    return parsed.claims.map((claim) => ({
      ...claim,
      remedyAliases: claim.remedyAliases ?? [],
      safetyNotes: claim.safetyNotes ?? [],
    }));
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
  if (!visionAvailable() || !config.hfVisionModel) return null;

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
          image_url: { url: candidate.imageUrl },
        },
      ],
    },
  ];

  const raw = await callHfChat(prompt, config.hfVisionModel, 500);
  if (!raw) return null;
  const jsonBlock = extractFirstJsonObject(raw);
  if (!jsonBlock) return null;

  try {
    return imageSchema.parse(JSON.parse(jsonBlock));
  } catch {
    return null;
  }
};
