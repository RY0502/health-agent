import express from "express";
import { buildAgentGraph } from "./agent/graph.js";
import { config } from "./config.js";
const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.post("/research", async (req, res) => {
    const query = String(req.body?.query ?? "").trim();
    const topN = Number(req.body?.topN ?? config.defaultTopN);
    if (!query) {
        res.status(400).json({ error: "query is required" });
        return;
    }
    try {
        const graph = buildAgentGraph();
        const result = await graph.invoke({
            input: {
                query,
                topN,
                locale: config.locale,
                outputRoot: config.outputRoot,
            },
        });
        res.json({
            status: result.status,
            report: result.report,
            artifact: result.artifact,
        });
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "unknown error",
        });
    }
});
app.listen(config.port, () => {
    console.log(`complementary-health-agent listening on :${config.port}`);
});
