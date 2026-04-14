import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentStateType } from "./state.js";
import { buildRunDir, ensureDir } from "../utils/fs.js";
import { clamp, overlapScore, sentenceWindow, shortText, tokenize, toTitleCase, unique } from "../utils/text.js";
import type { ExtractedClaim, Modality, RankedRemedy, SearchPlan, SourceDocument } from "../types.js";
import { config } from "../config.js";
import { DuckDuckGoSearchService } from "../services/search/duckduckgo.js";
import { fetchDocument } from "../services/retrieval/fetch.js";
import { extractClaimsWithLlm, llmAvailable } from "../services/llm.js";
import { rankClaims } from "../services/ranking/scoring.js";
import { chooseBestImage } from "../services/images/verify.js";
import { writeReportArtifacts } from "../services/report/render.js";

const searchService = new DuckDuckGoSearchService();

const OUT_OF_SCOPE_TERMS = [
  "heart attack",
  "stroke",
  "severe bleeding",
  "suicidal",
  "suicide",
  "overdose",
  "anaphylaxis",
  "sepsis",
  "choking",
  "unconscious",
  "emergency",
  "urgent care",
  "call 911",
];

const MODALITY_HINTS: Record<Modality, string[]> = {
  acupressure: ["acupressure", "pressure point", "pressure points", "meridian", "pc6", "p6", "yintang"],
  mudra: ["mudra", "mudras", "hand gesture", "hand gestures", "hasta"],
  yoga: ["yoga", "asana", "pose", "poses"],
  pranayama: ["pranayama", "breathing", "breathwork", "breath", "nadi shodhana", "bhramari"],
  ayurveda: ["ayurveda", "ayurvedic", "herb", "herbal", "dosha"],
  lifestyle: ["natural", "lifestyle", "diet", "exercise", "walking", "weight loss", "lose weight"],
};

const REMEDY_LEXICON: Array<{ canonical: string; aliases: string[]; modality: Modality; safety: string[] }> = [
  { canonical: "Yintang", aliases: ["yintang", "extra 1"], modality: "acupressure", safety: ["Avoid pressing irritated skin."] },
  { canonical: "PC6 (Neiguan)", aliases: ["pc6", "p6", "neiguan"], modality: "acupressure", safety: ["Use moderate pressure and avoid bruised skin."] },
  { canonical: "HT7 (Shenmen)", aliases: ["ht7", "shenmen"], modality: "acupressure", safety: ["Reduce pressure if tenderness increases." ] },
  { canonical: "GV20 (Baihui)", aliases: ["gv20", "baihui"], modality: "acupressure", safety: ["Avoid aggressive stimulation if dizzy."] },
  { canonical: "LI4 (Hegu)", aliases: ["li4", "hegu"], modality: "acupressure", safety: ["Often avoided during pregnancy unless guided by a clinician."] },
  { canonical: "Ear Shen Men", aliases: ["ear shen men", "ear shenmen", "auricular shen men"], modality: "acupressure", safety: ["Keep ear acupressure gentle."] },
  { canonical: "Gyan Mudra", aliases: ["gyan mudra", "jnana mudra"], modality: "mudra", safety: ["Stop if hand strain appears."] },
  { canonical: "Prana Mudra", aliases: ["prana mudra"], modality: "mudra", safety: ["Keep wrists relaxed."] },
  { canonical: "Dhyana Mudra", aliases: ["dhyana mudra"], modality: "mudra", safety: ["Use a comfortable seated posture."] },
  { canonical: "Apana Vayu Mudra", aliases: ["apana vayu mudra", "mritsanjeevani mudra"], modality: "mudra", safety: ["Do not force finger joints."] },
  { canonical: "Shuni Mudra", aliases: ["shuni mudra"], modality: "mudra", safety: ["Ease off if finger joints ache."] },
  { canonical: "Balasana (Child's Pose)", aliases: ["balasana", "child's pose", "childs pose"], modality: "yoga", safety: ["Use padding for knees if needed."] },
  { canonical: "Viparita Karani (Legs-Up-the-Wall)", aliases: ["viparita karani", "legs-up-the-wall", "legs up the wall"], modality: "yoga", safety: ["Skip if inverted positions are not comfortable."] },
  { canonical: "Setu Bandhasana (Bridge Pose)", aliases: ["setu bandhasana", "bridge pose"], modality: "yoga", safety: ["Move in and out slowly."] },
  { canonical: "Savasana", aliases: ["savasana", "shavasana", "corpse pose"], modality: "yoga", safety: ["Support the neck and knees for comfort."] },
  { canonical: "Supta Baddha Konasana", aliases: ["supta baddha konasana", "reclined bound angle"], modality: "yoga", safety: ["Use bolsters as needed."] },
  { canonical: "Bhramari Pranayama", aliases: ["bhramari", "bhramari pranayama", "bee breath"], modality: "pranayama", safety: ["Keep the breath relaxed and unforced."] },
  { canonical: "Nadi Shodhana", aliases: ["nadi shodhana", "alternate nostril breathing"], modality: "pranayama", safety: ["Breathe gently without breath-holding strain."] },
  { canonical: "Diaphragmatic Breathing", aliases: ["diaphragmatic breathing", "belly breathing"], modality: "pranayama", safety: ["Keep the pace comfortable."] },
  { canonical: "Box Breathing", aliases: ["box breathing", "square breathing"], modality: "pranayama", safety: ["Reduce the count if breath retention feels uncomfortable."] },
  { canonical: "Ashwagandha", aliases: ["ashwagandha", "withania somnifera"], modality: "ayurveda", safety: ["Check for medication interactions before ingesting."] },
  { canonical: "Turmeric", aliases: ["turmeric", "curcumin"], modality: "ayurveda", safety: ["Review interactions before concentrated supplement use."] },
  { canonical: "Triphala", aliases: ["triphala"], modality: "ayurveda", safety: ["Start cautiously with ingestible herbs."] },
  { canonical: "Abhyanga", aliases: ["abhyanga", "self oil massage"], modality: "ayurveda", safety: ["Avoid broken or irritated skin."] },
  { canonical: "Walking", aliases: ["walking", "brisk walking"], modality: "lifestyle", safety: ["Increase duration gradually."] },
  { canonical: "Resistance Training", aliases: ["resistance training", "strength training"], modality: "lifestyle", safety: ["Choose loads that allow controlled form."] },
  { canonical: "High-Fiber Meals", aliases: ["fiber", "high-fiber", "high fiber meals"], modality: "lifestyle", safety: ["Increase fiber with hydration."] },
  { canonical: "Protein-Forward Meals", aliases: ["protein", "high-protein", "protein-forward meals"], modality: "lifestyle", safety: ["Match intake to personal needs and preferences."] },
  { canonical: "Surya Namaskar", aliases: ["surya namaskar", "sun salutation"], modality: "yoga", safety: ["Scale repetitions to current capacity."] },
];

const hasAny = (query: string, needles: string[]): boolean => needles.some((needle) => query.includes(needle));

const detectModalities = (query: string): Modality[] => {
  const lowered = query.toLowerCase();
  const explicit = (Object.entries(MODALITY_HINTS) as Array<[Modality, string[]]>)
    .filter(([, hints]) => hasAny(lowered, hints))
    .map(([modality]) => modality);

  if (explicit.length) return unique(explicit);
  return ["acupressure", "mudra", "yoga", "pranayama", "ayurveda", "lifestyle"];
};

const extractKeyTerms = (query: string): string[] =>
  unique(tokenize(query)).filter((token) => !["best", "most", "effective", "give", "provide", "natural", "top"].includes(token));

const buildPlan = (query: string): SearchPlan => {
  const modalities = detectModalities(query);
  const keyTerms = extractKeyTerms(query);
  const modalityTerms = modalities.join(" ");
  const officialQueries = [
    `${query} site:nccih.nih.gov`,
    `${query} site:medlineplus.gov`,
    `${query} site:nih.gov`,
    `${query} site:who.int`,
  ];
  const literatureQueries = [
    `${query} systematic review`,
    `${query} meta-analysis`,
    `${query} randomized trial`,
    `${query} pubmed`,
  ];
  const hospitalQueries = [
    `${query} hospital patient education`,
    `${query} site:mskcc.org`,
    `${query} site:.edu`,
    `${query} clinic guidance`,
  ];
  const traditionalQueries = [
    `${query} ${modalityTerms} traditional literature`,
    `${query} ayurveda yoga classical text`,
    `${query} complementary medicine review`,
  ];
  const contradictionQueries = [
    `${query} contraindications`,
    `${query} adverse effects`,
    `${query} evidence insufficient`,
  ];
  const imageQueries = [
    `${query} diagram`,
    `${query} illustrated`,
    `${query} point location`,
    `${query} hand position`,
  ];

  return {
    normalizedQuery: query.trim(),
    modalities,
    officialQueries,
    literatureQueries,
    hospitalQueries,
    traditionalQueries,
    contradictionQueries,
    imageQueries,
    requiredKeywords: keyTerms,
    excludedKeywords: ["miracle cure", "instant cure", "overnight"],
  };
};

const heuristicClaimsFromDocument = (query: string, doc: SourceDocument, modalities: Modality[]): ExtractedClaim[] => {
  const loweredText = `${doc.title} ${doc.text}`.toLowerCase();
  const condition = shortText(query, 120);
  const queryTokens = tokenize(query);

  return REMEDY_LEXICON.filter((item) => modalities.includes(item.modality))
    .filter((item) => item.aliases.some((alias) => loweredText.includes(alias.toLowerCase())))
    .map((item) => {
      const matchedAlias = item.aliases.find((alias) => loweredText.includes(alias.toLowerCase())) ?? item.canonical;
      const localContext = sentenceWindow(doc.text, matchedAlias, 260) || sentenceWindow(doc.snippet, matchedAlias, 160);
      const specificity = Math.max(
        overlapScore(localContext, queryTokens),
        overlapScore(`${doc.title} ${doc.snippet}`, queryTokens),
      );

      return {
        remedyCanonical: item.canonical,
        remedyAliases: item.aliases,
        modality: item.modality,
        targetCondition: condition,
        claimedBenefit: shortText(localContext || doc.snippet || `Referenced for ${query}.`, 220),
        instructionSummary: shortText(localContext || doc.snippet || `See source text for details on ${item.canonical}.`, 320),
        rationaleSummary: shortText(doc.snippet || localContext || doc.title, 220),
        safetyNotes: item.safety,
        evidenceType: doc.evidenceType,
        sourceTier: doc.sourceTier,
        sourceUrl: doc.url,
        sourceTitle: doc.title,
        sourceDomain: doc.domain,
        occurrenceWeight: doc.sourceTier === "official" ? 1.2 : doc.sourceTier === "literature" ? 1.1 : 1,
        querySpecificity: clamp(specificity),
      };
    });
};

const enrichClaimsWithLlm = async (query: string, doc: SourceDocument): Promise<ExtractedClaim[]> => {
  if (!llmAvailable()) return [];
  const extracted = await extractClaimsWithLlm(query, doc);
  return extracted.map((claim) => ({
    ...claim,
    evidenceType: doc.evidenceType,
    sourceTier: doc.sourceTier,
    sourceUrl: doc.url,
    sourceTitle: doc.title,
    sourceDomain: doc.domain,
    occurrenceWeight: doc.sourceTier === "official" ? 1.2 : doc.sourceTier === "literature" ? 1.1 : 1,
    querySpecificity: clamp(overlapScore(`${claim.claimedBenefit} ${claim.instructionSummary}`, query)),
  }));
};

export const initializeNode = async (state: AgentStateType) => {
  const runId = crypto.randomUUID().slice(0, 8);
  const input = {
    query: state.input.query.trim(),
    topN: state.input.topN ?? config.defaultTopN,
    locale: state.input.locale ?? config.locale,
    outputRoot: state.input.outputRoot ?? config.outputRoot,
  };
  const outputDir = buildRunDir(input.outputRoot!, input.query, runId);
  await ensureDir(outputDir);
  return {
    input,
    runId,
    outputDir,
    notes: [
      "Primary ranking uses evidence-weighted consensus, source authority, safety, and query specificity.",
      "Secondary appendix shows top-match frequency and agreement patterns only.",
    ],
  };
};

export const scopeNode = async (state: AgentStateType) => {
  const lowered = state.input.query.toLowerCase();
  const isOutOfScope = OUT_OF_SCOPE_TERMS.some((term) => lowered.includes(term));
  if (isOutOfScope) {
    return {
      status: "out_of_scope" as const,
      outOfScopeMessage: "This query is out of scope for the agent.",
      notes: [...state.notes, "Out-of-scope handling is intentionally brief and non-escalatory."],
    };
  }
  return { status: "pending" as const };
};

export const routeAfterScope = (state: AgentStateType) => (state.status === "out_of_scope" ? "report" : "plan");

export const planNode = async (state: AgentStateType) => {
  const plan = buildPlan(state.input.query);
  return {
    plan,
    notes: [...state.notes, `Search plan generated for modalities: ${plan.modalities.join(", ")}.`],
  };
};

export const searchNode = async (state: AgentStateType) => {
  const webHits = await searchService.searchPlan(state.plan!);
  return {
    webHits,
    notes: [...state.notes, `Collected ${webHits.length} deduplicated web results across all search families.`],
  };
};

export const fetchNode = async (state: AgentStateType) => {
  const selected = state.webHits.slice(0, config.maxFetchedDocs);
  const documents = await Promise.all(selected.map((hit) => fetchDocument(hit)));
  await writeFile(path.join(state.outputDir, "sources.json"), JSON.stringify(documents, null, 2), "utf8");
  return {
    documents,
    notes: [...state.notes, `Fetched ${documents.length} source documents for extraction.`],
  };
};

export const extractNode = async (state: AgentStateType) => {
  const claims: ExtractedClaim[] = [];
  for (const doc of state.documents) {
    const heuristic = heuristicClaimsFromDocument(state.input.query, doc, state.plan!.modalities);
    claims.push(...heuristic);
    try {
      const llmClaims = await enrichClaimsWithLlm(state.input.query, doc);
      for (const claim of llmClaims) {
        if (!claims.some((existing) => existing.remedyCanonical === claim.remedyCanonical && existing.sourceUrl === claim.sourceUrl)) {
          claims.push(claim);
        }
      }
    } catch {
      // ignore llm extraction errors; heuristic path remains available
    }
  }

  const filtered = claims.filter((claim) => !state.plan!.excludedKeywords.some((term) => claim.claimedBenefit.toLowerCase().includes(term)));
  await writeFile(path.join(state.outputDir, "claims.json"), JSON.stringify(filtered, null, 2), "utf8");
  return {
    claims: filtered,
    notes: [...state.notes, `Extracted ${filtered.length} remedy claims from the research corpus.`],
  };
};

export const rankNode = async (state: AgentStateType) => {
  const { primary, secondary } = rankClaims(state.claims, state.input.topN ?? config.defaultTopN);
  return {
    primaryRanked: primary,
    secondaryRanked: secondary,
    notes: [...state.notes, `Ranked ${primary.length} primary remedies and ${secondary.length} secondary top matches.`],
  };
};

const buildImageQueriesForRemedy = (query: string, remedy: RankedRemedy): string[] => {
  const suffix =
    remedy.modality === "acupressure"
      ? "point location diagram"
      : remedy.modality === "mudra"
        ? "hand mudra diagram"
        : remedy.modality === "yoga"
          ? "pose diagram"
          : remedy.modality === "pranayama"
            ? "practice diagram"
            : "illustration";
  return unique([
    `${remedy.remedyCanonical} ${suffix}`,
    `${remedy.remedyCanonical} ${query}`,
    `${remedy.remedyCanonical} reliable diagram`,
  ]);
};

export const imageNode = async (state: AgentStateType) => {
  const withImages: RankedRemedy[] = [];
  for (const remedy of state.primaryRanked) {
    const imageQueries = buildImageQueriesForRemedy(state.input.query, remedy);
    const searched = await Promise.all(imageQueries.map((query) => searchService.searchRemedyImages(query)));
    const supportingDocImages = remedy.supportingClaims.flatMap((claim) => {
      const doc = state.documents.find((candidate) => candidate.url === claim.sourceUrl);
      return (doc?.images ?? []).filter((image) => {
        const corpus = `${image.title} ${image.altText ?? ""}`.toLowerCase();
        return [claim.remedyCanonical, ...claim.remedyAliases].some((alias) => corpus.includes(alias.toLowerCase()));
      });
    });
    const bestImage = await chooseBestImage(remedy, [...supportingDocImages, ...searched.flat()]);
    withImages.push({ ...remedy, image: bestImage });
  }
  return {
    primaryRanked: withImages,
    notes: [...state.notes, "Image ranking combined source authority, lexical max-match, and optional vision verification."],
  };
};

export const reportNode = async (state: AgentStateType) => {
  const report = {
    runId: state.runId,
    generatedAt: new Date().toISOString(),
    query: state.input.query,
    status: (state.status === "out_of_scope" ? "out_of_scope" : "completed") as "completed" | "out_of_scope",
    disclaimer:
      "This agent provides complementary-health information for non-emergency queries. Primary results are evidence-first. The secondary appendix reflects top web matches only and can overstate repeated low-quality content.",
    methodology: [
      "Expanded the user query into official, literature, hospital, traditional, contradiction, and image-search families.",
      "Retrieved pages with direct fetch first and a browser fallback when needed.",
      "Extracted remedy claims with heuristics and optional structured LLM extraction.",
      "Ranked remedies by evidence quality, independent source families, authority, safety profile, and query specificity.",
      "Ranked images by reliable source authority, textual max-match, and optional vision verification.",
    ],
    primaryResults: state.status === "out_of_scope" ? [] : state.primaryRanked,
    secondaryTopMatches: state.status === "out_of_scope" ? [] : state.secondaryRanked,
    notes: state.notes,
    outOfScopeMessage: state.status === "out_of_scope" ? "This query is out of scope for the agent." : undefined,
  };

  const artifact = await writeReportArtifacts(state.outputDir, report);
  return {
    report,
    artifact,
    status: state.status === "out_of_scope" ? "out_of_scope" as const : "completed" as const,
  };
};
