import type { ExtractedClaim, ImageCandidate, Modality, SourceDocument, VerifiedImage } from "../types.js";
export declare const llmAvailable: () => boolean;
export declare const visionAvailable: () => boolean;
export declare const extractClaimsWithLlm: (query: string, doc: SourceDocument) => Promise<Omit<ExtractedClaim, "evidenceType" | "sourceTier" | "sourceUrl" | "sourceTitle" | "sourceDomain" | "occurrenceWeight" | "querySpecificity">[]>;
export declare const verifyImageWithVision: (remedyName: string, modality: Modality, referenceText: string, candidate: ImageCandidate) => Promise<Pick<VerifiedImage, "accuracyScore" | "explanation"> | null>;
