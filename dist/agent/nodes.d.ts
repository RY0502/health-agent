import type { AgentStateType } from "./state.js";
import type { ExtractedClaim, RankedRemedy, SearchPlan, SourceDocument } from "../types.js";
export declare const initializeNode: (state: AgentStateType) => Promise<{
    input: {
        query: string;
        topN: number;
        locale: string;
        outputRoot: string;
    };
    runId: string;
    outputDir: string;
    notes: string[];
}>;
export declare const scopeNode: (state: AgentStateType) => Promise<{
    status: "out_of_scope";
    outOfScopeMessage: string;
    notes: string[];
} | {
    status: "pending";
    outOfScopeMessage?: undefined;
    notes?: undefined;
}>;
export declare const routeAfterScope: (state: AgentStateType) => "report" | "plan";
export declare const planNode: (state: AgentStateType) => Promise<{
    plan: SearchPlan;
    notes: string[];
}>;
export declare const searchNode: (state: AgentStateType) => Promise<{
    webHits: import("../types.js").WebSearchHit[];
    notes: string[];
}>;
export declare const fetchNode: (state: AgentStateType) => Promise<{
    documents: SourceDocument[];
    notes: string[];
}>;
export declare const extractNode: (state: AgentStateType) => Promise<{
    claims: ExtractedClaim[];
    notes: string[];
}>;
export declare const rankNode: (state: AgentStateType) => Promise<{
    primaryRanked: RankedRemedy[];
    secondaryRanked: RankedRemedy[];
    notes: string[];
}>;
export declare const imageNode: (state: AgentStateType) => Promise<{
    primaryRanked: RankedRemedy[];
    notes: string[];
}>;
export declare const reportNode: (state: AgentStateType) => Promise<{
    report: {
        runId: string;
        generatedAt: string;
        query: string;
        status: "completed" | "out_of_scope";
        disclaimer: string;
        methodology: string[];
        primaryResults: RankedRemedy[];
        secondaryTopMatches: RankedRemedy[];
        notes: string[];
        outOfScopeMessage: string | undefined;
    };
    artifact: import("../types.js").ReportArtifact;
    status: "completed" | "out_of_scope";
}>;
