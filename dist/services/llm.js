import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { config } from "../config.js";
const claimSchema = z.object({
    claims: z.array(z.object({
        remedyCanonical: z.string(),
        remedyAliases: z.array(z.string()).default([]),
        modality: z.enum(["ayurveda", "yoga", "pranayama", "acupressure", "mudra", "lifestyle"]),
        targetCondition: z.string(),
        claimedBenefit: z.string(),
        instructionSummary: z.string(),
        rationaleSummary: z.string(),
        safetyNotes: z.array(z.string()).default([]),
    })),
});
const imageSchema = z.object({
    accuracyScore: z.number().min(0).max(1),
    explanation: z.string(),
});
const baseChatModel = () => {
    if (!config.openAiApiKey || !config.textModel)
        return null;
    return new ChatOpenAI({
        apiKey: config.openAiApiKey,
        model: config.textModel,
        configuration: config.openAiBaseUrl ? { baseURL: config.openAiBaseUrl } : undefined,
        temperature: 0,
    });
};
const visionChatModel = () => {
    if (!config.openAiApiKey || !config.visionModel)
        return null;
    return new ChatOpenAI({
        apiKey: config.openAiApiKey,
        model: config.visionModel,
        configuration: config.openAiBaseUrl ? { baseURL: config.openAiBaseUrl } : undefined,
        temperature: 0,
    });
};
export const llmAvailable = () => Boolean(baseChatModel());
export const visionAvailable = () => Boolean(visionChatModel());
export const extractClaimsWithLlm = async (query, doc) => {
    const model = baseChatModel();
    if (!model)
        return [];
    const structured = model.withStructuredOutput(claimSchema);
    const response = await structured.invoke([
        new HumanMessage(`User query: ${query}\n\n` +
            `Document title: ${doc.title}\nURL: ${doc.url}\n` +
            `Extract up to 8 remedies directly relevant to the user query. ` +
            `Keep the tone factual and non-alarming. Return empty claims if the page is not useful.\n\n` +
            `Document excerpt:\n${doc.text.slice(0, 12000)}`),
    ]);
    return response.claims.map((claim) => ({ ...claim, remedyAliases: claim.remedyAliases ?? [], safetyNotes: claim.safetyNotes ?? [] }));
};
export const verifyImageWithVision = async (remedyName, modality, referenceText, candidate) => {
    const model = visionChatModel();
    if (!model)
        return null;
    const structured = model.withStructuredOutput(imageSchema);
    const response = await structured.invoke([
        new HumanMessage({
            content: [
                {
                    type: "text",
                    text: `Assess whether this image accurately represents ${remedyName} for modality ${modality}. ` +
                        `Use this reference description: ${referenceText}. ` +
                        `Score from 0 to 1 and explain briefly.`,
                },
                {
                    type: "image_url",
                    image_url: { url: candidate.imageUrl },
                },
            ],
        }),
    ]);
    return response;
};
