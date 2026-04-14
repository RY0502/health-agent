import type { AgentInput, ExtractedClaim, ReportArtifact, ReportPayload, RankedRemedy, SearchPlan, SourceDocument, WebSearchHit } from "../types.js";
export declare const AgentState: import("@langchain/langgraph").AnnotationRoot<{
    input: import("@langchain/langgraph").BaseChannel<AgentInput, AgentInput | import("@langchain/langgraph").OverwriteValue<AgentInput>, unknown>;
    runId: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    outputDir: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    status: import("@langchain/langgraph").BaseChannel<"completed" | "out_of_scope" | "pending", "completed" | "out_of_scope" | "pending" | import("@langchain/langgraph").OverwriteValue<"completed" | "out_of_scope" | "pending">, unknown>;
    outOfScopeMessage: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    plan: import("@langchain/langgraph").BaseChannel<SearchPlan | null, SearchPlan | import("@langchain/langgraph").OverwriteValue<SearchPlan | null> | null, unknown>;
    webHits: import("@langchain/langgraph").BaseChannel<WebSearchHit[], WebSearchHit[] | import("@langchain/langgraph").OverwriteValue<WebSearchHit[]>, unknown>;
    documents: import("@langchain/langgraph").BaseChannel<SourceDocument[], SourceDocument[] | import("@langchain/langgraph").OverwriteValue<SourceDocument[]>, unknown>;
    claims: import("@langchain/langgraph").BaseChannel<ExtractedClaim[], ExtractedClaim[] | import("@langchain/langgraph").OverwriteValue<ExtractedClaim[]>, unknown>;
    primaryRanked: import("@langchain/langgraph").BaseChannel<RankedRemedy[], RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<RankedRemedy[]>, unknown>;
    secondaryRanked: import("@langchain/langgraph").BaseChannel<RankedRemedy[], RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<RankedRemedy[]>, unknown>;
    report: import("@langchain/langgraph").BaseChannel<ReportPayload | null, ReportPayload | import("@langchain/langgraph").OverwriteValue<ReportPayload | null> | null, unknown>;
    artifact: import("@langchain/langgraph").BaseChannel<ReportArtifact | null, ReportArtifact | import("@langchain/langgraph").OverwriteValue<ReportArtifact | null> | null, unknown>;
    notes: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
}>;
export type AgentStateType = typeof AgentState.State;
