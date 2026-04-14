import { buildAgentGraph } from "./agent/graph.js";
import { config } from "./config.js";
const main = async () => {
    const query = process.argv.slice(2).join(" ").trim();
    if (!query) {
        console.error("Usage: npm run cli -- \"your query\"");
        process.exit(1);
    }
    const graph = buildAgentGraph();
    const result = await graph.invoke({
        input: {
            query,
            topN: config.defaultTopN,
            locale: config.locale,
            outputRoot: config.outputRoot,
        },
    });
    console.log(JSON.stringify({
        status: result.status,
        outOfScopeMessage: result.outOfScopeMessage || undefined,
        outputDir: result.artifact?.outputDir,
        htmlPath: result.artifact?.htmlPath,
        pdfPath: result.artifact?.pdfPath,
        jsonPath: result.artifact?.jsonPath,
        primaryResults: result.report?.primaryResults.map((item) => ({
            remedy: item.remedyCanonical,
            primaryScore: item.primaryScore,
        })),
    }, null, 2));
};
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
