export type Modality =
  | "ayurveda"
  | "yoga"
  | "pranayama"
  | "acupressure"
  | "mudra"
  | "lifestyle";

export type SourceTier =
  | "official"
  | "literature"
  | "hospital"
  | "traditional"
  | "open_web";

export type EvidenceType =
  | "systematic_review"
  | "meta_analysis"
  | "rct"
  | "observational"
  | "official_guidance"
  | "traditional_text"
  | "expert_patient_education"
  | "open_web";

export type SearchDepth = "default" | "extra_deep";

export interface AgentInput {
  query: string;
  topN?: number;
  locale?: string;
  outputRoot?: string;
}

export interface SearchPlan {
  originalQuery: string;
  normalizedQuery: string;
  searchDepth: SearchDepth;
  targetWebResults: number;
  targetImageResults: number;
  modalities: Modality[];
  officialQueries: string[];
  literatureQueries: string[];
  hospitalQueries: string[];
  traditionalQueries: string[];
  contradictionQueries: string[];
  imageQueries: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
}

export interface WebSearchHit {
  query: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  sourceTierHint: SourceTier;
}

export interface ImageCandidate {
  query: string;
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl: string;
  sourceDomain: string;
  title: string;
  width?: number;
  height?: number;
  sourceLabel?: string;
  pageTitle?: string;
  altText?: string;
  authorityScore?: number;
  licenseHint?: string;
}

export interface SourceDocument {
  url: string;
  title: string;
  domain: string;
  sourceTier: SourceTier;
  evidenceType: EvidenceType;
  snippet: string;
  text: string;
  references: string[];
  images: ImageCandidate[];
  fetchedAt: string;
  retrievalMethod: "fetch" | "playwright" | "search-snippet";
}

export interface ExtractedClaim {
  remedyCanonical: string;
  remedyAliases: string[];
  modality: Modality;
  targetCondition: string;
  claimedBenefit: string;
  instructionSummary: string;
  rationaleSummary: string;
  safetyNotes: string[];
  evidenceType: EvidenceType;
  sourceTier: SourceTier;
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  occurrenceWeight: number;
  querySpecificity: number;
}

export interface VerifiedImage {
  imageUrl: string;
  sourcePageUrl: string;
  sourceDomain: string;
  title: string;
  verificationMethod: "heuristic" | "vision_llm" | "heuristic_plus_vision";
  accuracyScore: number;
  authorityScore: number;
  maxMatchScore: number;
  explanation: string;
  licenseHint?: string;
}

export interface RankedRemedy {
  remedyCanonical: string;
  modality: Modality;
  primaryScore: number;
  secondaryTopMatchScore: number;
  evidenceConfidence: "high" | "moderate" | "low" | "insufficient";
  independentDomainCount: number;
  occurrenceCount: number;
  rationale: string[];
  instructionSummary: string;
  safetySummary: string[];
  supportingClaims: ExtractedClaim[];
  image?: VerifiedImage;
}

export interface ReportArtifact {
  runId: string;
  query: string;
  outputDir: string;
  htmlPath: string;
  pdfPath?: string;
  jsonPath: string;
}

export interface ReportPayload {
  runId: string;
  generatedAt: string;
  query: string;
  status: "completed" | "out_of_scope";
  disclaimer: string;
  methodology: string[];
  primaryResults: RankedRemedy[];
  secondaryTopMatches: RankedRemedy[];
  notes: string[];
  outOfScopeMessage?: string;
}
