import type { ReportArtifact, ReportPayload } from "../../types.js";
export declare const renderHtml: (payload: ReportPayload) => string;
export declare const writeReportArtifacts: (outputDir: string, payload: ReportPayload) => Promise<ReportArtifact>;
