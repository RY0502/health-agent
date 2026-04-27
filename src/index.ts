import { buildAgentGraph } from "./agent/graph.js";
import { config } from "./config.js";
import { logError, logInfo } from "./utils/log.js";

const main = async () => {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error("Usage: npm run cli -- \"your query\"");
    process.exit(1);
  }

  logInfo("cli", "Starting research run", { query, topN: config.defaultTopN, outputRoot: config.outputRoot });
  const graph = buildAgentGraph();
  const result = await graph.invoke({
    input: {
      query,
      topN: config.defaultTopN,
      locale: config.locale,
      outputRoot: config.outputRoot,
    },
  });

  logInfo("cli", "Research run completed", {
    status: result.status,
    outputDir: result.artifact?.outputDir,
    primaryResults: result.report?.primaryResults.length ?? 0,
  });
  console.log(JSON.stringify({
    status: result.status,
    outOfScopeMessage: result.outOfScopeMessage || undefined,
    outputDir: result.artifact?.outputDir,
    htmlPath: result.artifact?.htmlPath,
    pdfPath: result.artifact?.pdfPath,
    jsonPath: result.artifact?.jsonPath,
    primaryResults: result.report?.primaryResults.map((item: { remedyCanonical: string; primaryScore: number }) => ({
      remedy: item.remedyCanonical,
      primaryScore: item.primaryScore,
    })),
  }, null, 2));
};

main().catch((error) => {
  logError("cli", "Research run failed", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  process.exit(1);
});
