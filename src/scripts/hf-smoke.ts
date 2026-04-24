import { config } from "../config.js";
import { extractClaimsWithLlm, llmAvailable, verifyImageWithVision, visionAvailable } from "../services/llm.js";
import type { SourceDocument } from "../types.js";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const main = async () => {
  if (!llmAvailable()) fail("HF text reasoning is not enabled or HF_TOKEN is missing.");
  if (!visionAvailable()) fail("HF vision reasoning is not enabled or HF_TOKEN is missing.");

  const sampleDoc: SourceDocument = {
    url: "https://example.org/acupressure-anxiety",
    title: "Acupressure for Anxiety Support",
    domain: "example.org",
    sourceTier: "open_web",
    evidenceType: "open_web",
    snippet: "PC6 (Neiguan), Yintang, and HT7 are commonly described as acupressure points used for anxiety support.",
    text:
      "This educational summary says PC6 (Neiguan), Yintang, and HT7 (Shenmen) are commonly described as acupressure points used for anxiety support. " +
      "It recommends gentle pressure, a comfortable seated posture, and stopping if discomfort increases.",
    references: [],
    images: [],
    fetchedAt: new Date().toISOString(),
    retrievalMethod: "search-snippet",
  };

  const claims = await extractClaimsWithLlm("best acupressure points for anxiety", sampleDoc);
  if (!claims.length) fail("HF text smoke test returned no claims.");

  const visionVerdict = await verifyImageWithVision(
    "Gyan Mudra",
    "mudra",
    "A person lightly touches the tip of the index finger to the thumb while the other fingers stay extended and relaxed.",
    {
      query: "hf smoke image",
      imageUrl: "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/cats.png",
      sourcePageUrl: "https://huggingface.co/datasets/huggingface/documentation-images",
      sourceDomain: "huggingface.co",
      title: "Cats sample image",
      altText: "Two cats resting on nets",
    },
  );

  if (!visionVerdict) fail("HF vision smoke test returned no verdict.");

  console.log(
    JSON.stringify(
      {
        hfBaseUrl: config.hfBaseUrl,
        hfTextModel: config.hfTextModel,
        hfVisionModel: config.hfVisionModel,
        claimCount: claims.length,
        firstClaim: claims[0],
        visionVerdict,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
