export interface AgentConfig {
    port: number;
    locale: string;
    defaultTopN: number;
    maxWebResultsPerQuery: number;
    maxFetchedDocs: number;
    maxImageCandidatesPerRemedy: number;
    outputRoot: string;
    usePlaywrightFallback: boolean;
    openAiApiKey?: string;
    openAiBaseUrl?: string;
    textModel?: string;
    visionModel?: string;
}
export declare const config: AgentConfig;
