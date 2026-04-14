export declare const buildAgentGraph: () => import("@langchain/langgraph").CompiledStateGraph<{
    input: import("../types.js").AgentInput;
    runId: string;
    outputDir: string;
    status: "completed" | "out_of_scope" | "pending";
    outOfScopeMessage: string;
    plan: import("../types.js").SearchPlan | null;
    webHits: import("../types.js").WebSearchHit[];
    documents: import("../types.js").SourceDocument[];
    claims: import("../types.js").ExtractedClaim[];
    primaryRanked: import("../types.js").RankedRemedy[];
    secondaryRanked: import("../types.js").RankedRemedy[];
    report: import("../types.js").ReportPayload | null;
    artifact: import("../types.js").ReportArtifact | null;
    notes: string[];
}, {
    input?: import("../types.js").AgentInput | import("@langchain/langgraph").OverwriteValue<import("../types.js").AgentInput> | undefined;
    runId?: string | import("@langchain/langgraph").OverwriteValue<string> | undefined;
    outputDir?: string | import("@langchain/langgraph").OverwriteValue<string> | undefined;
    status?: "completed" | "out_of_scope" | "pending" | import("@langchain/langgraph").OverwriteValue<"completed" | "out_of_scope" | "pending"> | undefined;
    outOfScopeMessage?: string | import("@langchain/langgraph").OverwriteValue<string> | undefined;
    plan?: import("../types.js").SearchPlan | import("@langchain/langgraph").OverwriteValue<import("../types.js").SearchPlan | null> | null | undefined;
    webHits?: import("../types.js").WebSearchHit[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").WebSearchHit[]> | undefined;
    documents?: import("../types.js").SourceDocument[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").SourceDocument[]> | undefined;
    claims?: import("../types.js").ExtractedClaim[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").ExtractedClaim[]> | undefined;
    primaryRanked?: import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]> | undefined;
    secondaryRanked?: import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]> | undefined;
    report?: import("../types.js").ReportPayload | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportPayload | null> | null | undefined;
    artifact?: import("../types.js").ReportArtifact | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportArtifact | null> | null | undefined;
    notes?: string[] | import("@langchain/langgraph").OverwriteValue<string[]> | undefined;
}, "__start__" | "initialize" | "scope" | "planning" | "searching" | "fetching" | "extracting" | "ranking" | "imaging" | "reporting", {
    input: import("@langchain/langgraph").BaseChannel<import("../types.js").AgentInput, import("../types.js").AgentInput | import("@langchain/langgraph").OverwriteValue<import("../types.js").AgentInput>, unknown>;
    runId: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    outputDir: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    status: import("@langchain/langgraph").BaseChannel<"completed" | "out_of_scope" | "pending", "completed" | "out_of_scope" | "pending" | import("@langchain/langgraph").OverwriteValue<"completed" | "out_of_scope" | "pending">, unknown>;
    outOfScopeMessage: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    plan: import("@langchain/langgraph").BaseChannel<import("../types.js").SearchPlan | null, import("../types.js").SearchPlan | import("@langchain/langgraph").OverwriteValue<import("../types.js").SearchPlan | null> | null, unknown>;
    webHits: import("@langchain/langgraph").BaseChannel<import("../types.js").WebSearchHit[], import("../types.js").WebSearchHit[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").WebSearchHit[]>, unknown>;
    documents: import("@langchain/langgraph").BaseChannel<import("../types.js").SourceDocument[], import("../types.js").SourceDocument[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").SourceDocument[]>, unknown>;
    claims: import("@langchain/langgraph").BaseChannel<import("../types.js").ExtractedClaim[], import("../types.js").ExtractedClaim[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").ExtractedClaim[]>, unknown>;
    primaryRanked: import("@langchain/langgraph").BaseChannel<import("../types.js").RankedRemedy[], import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]>, unknown>;
    secondaryRanked: import("@langchain/langgraph").BaseChannel<import("../types.js").RankedRemedy[], import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]>, unknown>;
    report: import("@langchain/langgraph").BaseChannel<import("../types.js").ReportPayload | null, import("../types.js").ReportPayload | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportPayload | null> | null, unknown>;
    artifact: import("@langchain/langgraph").BaseChannel<import("../types.js").ReportArtifact | null, import("../types.js").ReportArtifact | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportArtifact | null> | null, unknown>;
    notes: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
}, {
    input: import("@langchain/langgraph").BaseChannel<import("../types.js").AgentInput, import("../types.js").AgentInput | import("@langchain/langgraph").OverwriteValue<import("../types.js").AgentInput>, unknown>;
    runId: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    outputDir: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    status: import("@langchain/langgraph").BaseChannel<"completed" | "out_of_scope" | "pending", "completed" | "out_of_scope" | "pending" | import("@langchain/langgraph").OverwriteValue<"completed" | "out_of_scope" | "pending">, unknown>;
    outOfScopeMessage: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    plan: import("@langchain/langgraph").BaseChannel<import("../types.js").SearchPlan | null, import("../types.js").SearchPlan | import("@langchain/langgraph").OverwriteValue<import("../types.js").SearchPlan | null> | null, unknown>;
    webHits: import("@langchain/langgraph").BaseChannel<import("../types.js").WebSearchHit[], import("../types.js").WebSearchHit[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").WebSearchHit[]>, unknown>;
    documents: import("@langchain/langgraph").BaseChannel<import("../types.js").SourceDocument[], import("../types.js").SourceDocument[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").SourceDocument[]>, unknown>;
    claims: import("@langchain/langgraph").BaseChannel<import("../types.js").ExtractedClaim[], import("../types.js").ExtractedClaim[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").ExtractedClaim[]>, unknown>;
    primaryRanked: import("@langchain/langgraph").BaseChannel<import("../types.js").RankedRemedy[], import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]>, unknown>;
    secondaryRanked: import("@langchain/langgraph").BaseChannel<import("../types.js").RankedRemedy[], import("../types.js").RankedRemedy[] | import("@langchain/langgraph").OverwriteValue<import("../types.js").RankedRemedy[]>, unknown>;
    report: import("@langchain/langgraph").BaseChannel<import("../types.js").ReportPayload | null, import("../types.js").ReportPayload | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportPayload | null> | null, unknown>;
    artifact: import("@langchain/langgraph").BaseChannel<import("../types.js").ReportArtifact | null, import("../types.js").ReportArtifact | import("@langchain/langgraph").OverwriteValue<import("../types.js").ReportArtifact | null> | null, unknown>;
    notes: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
}, import("@langchain/langgraph").StateDefinition, {
    initialize: {
        input: {
            query: string;
            topN: number;
            locale: string;
            outputRoot: string;
        };
        runId: string;
        outputDir: string;
        notes: string[];
    };
    scope: {
        status: "out_of_scope";
        outOfScopeMessage: string;
        notes: string[];
    } | {
        status: "pending";
        outOfScopeMessage?: undefined;
        notes?: undefined;
    };
    planning: {
        plan: import("../types.js").SearchPlan;
        notes: string[];
    };
    searching: {
        webHits: import("../types.js").WebSearchHit[];
        notes: string[];
    };
    fetching: {
        documents: import("../types.js").SourceDocument[];
        notes: string[];
    };
    extracting: {
        claims: import("../types.js").ExtractedClaim[];
        notes: string[];
    };
    ranking: {
        primaryRanked: import("../types.js").RankedRemedy[];
        secondaryRanked: import("../types.js").RankedRemedy[];
        notes: string[];
    };
    imaging: {
        primaryRanked: import("../types.js").RankedRemedy[];
        notes: string[];
    };
    reporting: {
        report: {
            runId: string;
            generatedAt: string;
            query: string;
            status: "completed" | "out_of_scope";
            disclaimer: string;
            methodology: string[];
            primaryResults: import("../types.js").RankedRemedy[];
            secondaryTopMatches: import("../types.js").RankedRemedy[];
            notes: string[];
            outOfScopeMessage: string | undefined;
        };
        artifact: import("../types.js").ReportArtifact;
        status: "completed" | "out_of_scope";
    };
}, unknown, unknown>;
