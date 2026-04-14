import { Annotation } from "@langchain/langgraph";
import type { AgentInput, ExtractedClaim, ReportArtifact, ReportPayload, RankedRemedy, SearchPlan, SourceDocument, WebSearchHit } from "../types.js";

const overwrite = <T>(initial: T) =>
  Annotation<T>({
    reducer: (_left, right) => right,
    default: () => initial,
  });

export const AgentState = Annotation.Root({
  input: overwrite<AgentInput>({ query: "", topN: 5, locale: "en-us" }),
  runId: overwrite<string>(""),
  outputDir: overwrite<string>(""),
  status: overwrite<"pending" | "out_of_scope" | "completed">("pending"),
  outOfScopeMessage: overwrite<string>(""),
  plan: overwrite<SearchPlan | null>(null),
  webHits: overwrite<WebSearchHit[]>([]),
  documents: overwrite<SourceDocument[]>([]),
  claims: overwrite<ExtractedClaim[]>([]),
  primaryRanked: overwrite<RankedRemedy[]>([]),
  secondaryRanked: overwrite<RankedRemedy[]>([]),
  report: overwrite<ReportPayload | null>(null),
  artifact: overwrite<ReportArtifact | null>(null),
  notes: overwrite<string[]>([]),
});

export type AgentStateType = typeof AgentState.State;
