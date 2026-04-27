import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { ReportArtifact, ReportPayload, RankedRemedy } from "../../types.js";
import { ensureDir } from "../../utils/fs.js";
import { logWarn } from "../../utils/log.js";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderRemedy = (remedy: RankedRemedy, rank: number): string => `
  <section class="card">
    <h3>${rank}. ${escapeHtml(remedy.remedyCanonical)} <span class="pill">${escapeHtml(remedy.modality)}</span></h3>
    <p><strong>Primary score:</strong> ${remedy.primaryScore.toFixed(3)} | <strong>Confidence:</strong> ${escapeHtml(remedy.evidenceConfidence)}</p>
    <p><strong>Independent domains:</strong> ${remedy.independentDomainCount} | <strong>Occurrences:</strong> ${remedy.occurrenceCount}</p>
    <p><strong>How reliable sources describe this option:</strong> ${escapeHtml(remedy.instructionSummary || "No detailed description extracted.")}</p>
    <p><strong>Why it ranked here:</strong></p>
    <ul>${remedy.rationale.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p><strong>Use notes:</strong> ${escapeHtml(remedy.safetySummary.join(" | ") || "No special use note extracted.")}</p>
    ${
      remedy.image
        ? `<figure>
            <img src="${escapeHtml(remedy.image.imageUrl)}" alt="${escapeHtml(remedy.image.title)}" />
            <figcaption>${escapeHtml(remedy.image.title)} — source: ${escapeHtml(remedy.image.sourceDomain)} — image accuracy=${remedy.image.accuracyScore.toFixed(2)} — image max-match=${remedy.image.maxMatchScore.toFixed(2)}</figcaption>
          </figure>`
        : "<p><em>No high-confidence image was selected from the researched candidate pool.</em></p>"
    }
  </section>
`;

export const renderHtml = (payload: ReportPayload): string => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(payload.query)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #20252b; margin: 32px; line-height: 1.5; }
      h1, h2, h3 { color: #102a43; }
      .muted { color: #52606d; }
      .pill { display: inline-block; padding: 2px 8px; background: #e6f4ea; border-radius: 999px; font-size: 12px; }
      .card { border: 1px solid #d9e2ec; border-radius: 12px; padding: 16px; margin: 16px 0; break-inside: avoid; }
      figure { margin: 12px 0 0; }
      img { max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px; border: 1px solid #d9e2ec; }
      ul { margin-top: 8px; }
      .secondary { background: #f7f9fb; }
      .warning { padding: 12px; border-left: 4px solid #486581; background: #f0f4f8; }
      code { background: #f0f4f8; padding: 2px 4px; }
    </style>
  </head>
  <body>
    <h1>Complementary Health Research Report</h1>
    <p class="muted">Query: ${escapeHtml(payload.query)} | Run: ${escapeHtml(payload.runId)} | Generated: ${escapeHtml(payload.generatedAt)}</p>
    <div class="warning"><strong>Primary mode:</strong> evidence-first ranking of supportive options described across reliable sources. <strong>Secondary mode:</strong> top-match web prevalence appendix only.</div>
    <p>${escapeHtml(payload.disclaimer)}</p>

    ${payload.status === "out_of_scope" ? `<h2>Result</h2><p>${escapeHtml(payload.outOfScopeMessage || "This query is out of scope for the agent.")}</p>` : ""}

    ${
      payload.status === "completed"
        ? `<h2>Primary evidence-ranked results</h2>${payload.primaryResults.map((item, index) => renderRemedy(item, index + 1)).join("")}
           <h2>Methodology</h2><ul>${payload.methodology.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
           <h2>Secondary top-match appendix</h2>
           <p class="muted">This appendix reflects what appeared most often across the researched web corpus. It is informative but not the main evidence ranking and may overstate repeated weak content.</p>
           <div class="secondary">${payload.secondaryTopMatches.map((item, index) => renderRemedy(item, index + 1)).join("")}</div>`
        : ""
    }

    <h2>Notes</h2>
    <ul>${payload.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </body>
</html>`;

export const writeReportArtifacts = async (outputDir: string, payload: ReportPayload): Promise<ReportArtifact> => {
  await ensureDir(outputDir);
  const htmlPath = path.join(outputDir, "report.html");
  const jsonPath = path.join(outputDir, "report.json");
  const pdfPath = path.join(outputDir, "report.pdf");

  const html = renderHtml(payload);
  await fs.writeFile(htmlPath, html, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  let actualPdfPath: string | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" } });
    actualPdfPath = pdfPath;
  } catch (error) {
    logWarn("report", "PDF generation failed; HTML and JSON artifacts were still written", {
      outputDir,
      error: error instanceof Error ? error.message : String(error),
    });
    actualPdfPath = undefined;
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return {
    runId: payload.runId,
    query: payload.query,
    outputDir,
    htmlPath,
    pdfPath: actualPdfPath,
    jsonPath,
  };
};
