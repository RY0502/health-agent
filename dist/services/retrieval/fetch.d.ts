import type { SourceDocument, SourceTier, WebSearchHit, EvidenceType } from "../../types.js";
export declare const domainAuthority: (domain: string) => number;
export declare const detectSourceTier: (domain: string, title?: string) => SourceTier;
export declare const detectEvidenceType: (title: string, text: string, tier: SourceTier) => EvidenceType;
export declare const fetchDocument: (hit: WebSearchHit) => Promise<SourceDocument>;
export declare const describeSource: (doc: SourceDocument) => string;
