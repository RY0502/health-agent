import { Annotation } from "@langchain/langgraph";
const overwrite = (initial) => Annotation({
    reducer: (_left, right) => right,
    default: () => initial,
});
export const AgentState = Annotation.Root({
    input: overwrite({ query: "", topN: 5, locale: "en-us" }),
    runId: overwrite(""),
    outputDir: overwrite(""),
    status: overwrite("pending"),
    outOfScopeMessage: overwrite(""),
    plan: overwrite(null),
    webHits: overwrite([]),
    documents: overwrite([]),
    claims: overwrite([]),
    primaryRanked: overwrite([]),
    secondaryRanked: overwrite([]),
    report: overwrite(null),
    artifact: overwrite(null),
    notes: overwrite([]),
});
