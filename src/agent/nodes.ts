import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentStateType } from "./state.js";
import { buildRunDir, ensureDir } from "../utils/fs.js";
import { clamp, overlapScore, sentenceWindow, shortText, tokenize, unique } from "../utils/text.js";
import type { ExtractedClaim, Modality, RankedRemedy, SearchDepth, SearchPlan, SourceDocument, WebSearchHit } from "../types.js";
import { config } from "../config.js";
import { DuckDuckGoSearchService } from "../services/search/duckduckgo.js";
import { PubMedSearchService } from "../services/search/pubmed.js";
import { fetchDocument } from "../services/retrieval/fetch.js";
import { extractClaimsWithLlm, llmAvailable } from "../services/llm.js";
import { rankClaims } from "../services/ranking/scoring.js";
import { chooseBestImage } from "../services/images/verify.js";
import { writeReportArtifacts } from "../services/report/render.js";

const duckSearchService = new DuckDuckGoSearchService();
const pubMedSearchService = new PubMedSearchService();

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

const EXTRA_DEEP_PATTERNS = [
  /\bextra deep search\b/gi,
  /\bperform extra deep search\b/gi,
  /\bextra deep research\b/gi,
  /\bextra-deep search\b/gi,
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
  { canonical: "HT7 (Shenmen)", aliases: ["ht7", "shenmen"], modality: "acupressure", safety: ["Reduce pressure if tenderness increases."] },
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
  unique(tokenize(query)).filter((token) => !["best", "most", "effective", "give", "provide", "natural", "top", "extra", "deep", "search"].includes(token));

const detectSearchDepth = (query: string): SearchDepth =>
  EXTRA_DEEP_PATTERNS.some((pattern) => pattern.test(query)) ? "extra_deep" : "default";

const cleanPromptForSearch = (query: string): string => {
  let output = query;
  for (const pattern of EXTRA_DEEP_PATTERNS) {
    output = output.replace(pattern, " ");
  }
  return output.replace(/\s+/g, " ").trim();
};

const buildTemplateQueries = (baseQuery: string, keyTerms: string[], templates: string[]): string[] => {
  const variants = [baseQuery, ...keyTerms.map((term) => `${term} ${baseQuery}`), ...keyTerms.map((term) => `${baseQuery} ${term}`)];
  return unique(
    variants.flatMap((variant) => templates.map((template) => template.replaceAll("{q}", variant.trim()))),
  );
};

const buildPlan = (query: string): SearchPlan => {
  const searchDepth = detectSearchDepth(query);
  const normalizedQuery = cleanPromptForSearch(query);
  const modalities = detectModalities(normalizedQuery);
  const keyTerms = extractKeyTerms(normalizedQuery).slice(0, searchDepth === "extra_deep" ? 10 : 6);
  const modalityTerms = modalities.join(" ");

  const officialQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} site:nccih.nih.gov",
    "{q} site:medlineplus.gov",
    "{q} site:nih.gov",
    "{q} site:who.int",
    "{q} site:fda.gov",
  ]).slice(0, searchDepth === "extra_deep" ? 18 : 4);

  const literatureQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} systematic review",
    "{q} meta-analysis",
    "{q} randomized trial",
    "{q} pubmed",
    "{q} integrative medicine review",
  ]).slice(0, searchDepth === "extra_deep" ? 12 : 4);

  const hospitalQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} hospital patient education",
    "{q} site:mskcc.org",
    "{q} site:.edu",
    "{q} clinic guidance",
    "{q} site:mayo.edu",
  ]).slice(0, searchDepth === "extra_deep" ? 12 : 4);

  const traditionalQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} traditional literature",
    "{q} ayurveda yoga classical text",
    "{q} complementary medicine review",
    `{q} ${modalityTerms} classical practice`,
  ]).slice(0, searchDepth === "extra_deep" ? 12 : 4);

  const contradictionQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} contraindications",
    "{q} adverse effects",
    "{q} evidence insufficient",
    "{q} safety notes",
  ]).slice(0, searchDepth === "extra_deep" ? 10 : 3);

  const imageQueries = buildTemplateQueries(normalizedQuery, keyTerms, [
    "{q} diagram",
    "{q} illustrated",
    "{q} point location",
    "{q} hand position",
    "{q} educational image",
  ]).slice(0, searchDepth === "extra_deep" ? 12 : 4);

  return {
    originalQuery: query.trim(),
    normalizedQuery,
    searchDepth,
    targetWebResults: searchDepth === "extra_deep" ? 250 : 100,
    targetImageResults: searchDepth === "extra_deep" ? 250 : 100,
    modalities,
    officialQueries,
    literatureQueries,
    hospitalQueries,
    traditionalQueries,
    contradictionQueries,
    imageQueries,
    requiredKeywords: keyTerms,
    excludedKeywords: ["miracle cure", "instant cure", "overnight", "guaranteed cure"],
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
        claimedBenefit: shortText(localContext || doc.snippet || `Referenced in sources for ${query}.`, 220),
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


const buildTargetedRemedyQueries = (plan: SearchPlan): string[] => {
  const modalityMatches = REMEDY_LEXICON.filter((item) => plan.modalities.includes(item.modality));
  const coreNeed = plan.requiredKeywords.join(" ") || plan.normalizedQuery;
  const queries: string[] = [];

  for (const item of modalityMatches.slice(0, plan.searchDepth === "extra_deep" ? 18 : 10)) {
    queries.push(`${item.canonical} ${coreNeed}`);
    for (const alias of item.aliases.slice(0, 2)) {
      queries.push(`${alias} ${coreNeed}`);
    }
  }

  return unique(queries);
};

const mergeAndPrioritizeHits = (hits: WebSearchHit[], limit: number): WebSearchHit[] => {
  const priority: Record<WebSearchHit["sourceTierHint"], number> = {
    official: 5,
    literature: 4,
    hospital: 3,
    traditional: 2,
    open_web: 1,
  };
  const deduped = new Map<string, WebSearchHit>();
  for (const hit of hits) {
    if (!deduped.has(hit.url)) deduped.set(hit.url, hit);
  }
  return [...deduped.values()]
    .sort((a, b) => priority[b.sourceTierHint] - priority[a.sourceTierHint])
    .slice(0, limit);
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
      "The agent summarizes potentially supportive options described across reliable web and literature sources.",
      "It does not claim diagnosis, cure, or guaranteed outcomes.",
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
    notes: [
      ...state.notes,
      `Search plan generated for modalities: ${plan.modalities.join(", ")}.`,
      `Search depth: ${plan.searchDepth}. Website target=${plan.targetWebResults}; image target=${plan.targetImageResults}.`,
    ],
  };
};

export const searchNode = async (state: AgentStateType) => {
  const plan = state.plan!;
  const webTarget = Math.max(0, plan.targetWebResults - (plan.searchDepth === "extra_deep" ? 60 : 24));
  const [duckHits, pubMedHits] = await Promise.all([
    duckSearchService.searchPlan({ ...plan, targetWebResults: webTarget }),
    pubMedSearchService.searchPlan(plan),
  ]);

  let webHits = mergeAndPrioritizeHits([...duckHits, ...pubMedHits], plan.targetWebResults);

  if (webHits.length < Math.min(12, plan.targetWebResults)) {
    const targetedQueries = buildTargetedRemedyQueries(plan);
    const targetedHits = await duckSearchService.searchQueries(
      targetedQueries,
      Math.max(12, Math.min(40, plan.targetWebResults - webHits.length)),
      plan.searchDepth,
    );
    webHits = mergeAndPrioritizeHits([...webHits, ...targetedHits], plan.targetWebResults);
  }

  await writeFile(path.join(state.outputDir, "web-hits.json"), JSON.stringify(webHits, null, 2), "utf8");
  return {
    webHits,
    notes: [
      ...state.notes,
      `Collected ${webHits.length} deduplicated web results against a target of ${plan.targetWebResults}.`,
      `Search mix included open web discovery, direct PubMed literature retrieval, and targeted remedy queries when recall was low.`,
    ],
  };
};

export const fetchNode = async (state: AgentStateType) => {
  const fetchLimit = state.plan!.searchDepth === "extra_deep" ? 60 : 30;
  const selected = state.webHits.slice(0, Math.min(state.plan!.targetWebResults, config.maxFetchedDocs, fetchLimit));
  const documents = await Promise.all(selected.map((hit) => fetchDocument(hit)));
  await writeFile(path.join(state.outputDir, "sources.json"), JSON.stringify(documents, null, 2), "utf8");
  return {
    documents,
    notes: [...state.notes, `Fetched ${documents.length} source documents for extraction and comparison.`],
  };
};

export const extractNode = async (state: AgentStateType) => {
  const claims: ExtractedClaim[] = [];
  for (const doc of state.documents) {
    const heuristic = heuristicClaimsFromDocument(state.plan!.normalizedQuery, doc, state.plan!.modalities);
    claims.push(...heuristic);
    try {
      const llmClaims = await enrichClaimsWithLlm(state.plan!.normalizedQuery, doc);
      for (const claim of llmClaims) {
        if (!claims.some((existing) => existing.remedyCanonical === claim.remedyCanonical && existing.sourceUrl === claim.sourceUrl)) {
          claims.push(claim);
        }
      }
    } catch {
      // heuristic extraction remains the baseline path
    }
  }

  const filtered = claims.filter((claim) => !state.plan!.excludedKeywords.some((term) => claim.claimedBenefit.toLowerCase().includes(term)));
  await writeFile(path.join(state.outputDir, "claims.json"), JSON.stringify(filtered, null, 2), "utf8");
  return {
    claims: filtered,
    notes: [...state.notes, `Extracted ${filtered.length} remedy mentions from the research corpus.`],
  };
};

export const rankNode = async (state: AgentStateType) => {
  const { primary, secondary } = rankClaims(state.claims, state.input.topN ?? config.defaultTopN);
  return {
    primaryRanked: primary,
    secondaryRanked: secondary,
    notes: [
      ...state.notes,
      `Ranked ${primary.length} primary remedies and ${secondary.length} secondary top matches.`,
      `Ranking favors reliability and likely usefulness described across independent sources rather than cure claims.`,
    ],
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
    const imageQueries = buildImageQueriesForRemedy(state.plan!.normalizedQuery, remedy);
    const supportingDocImages = remedy.supportingClaims.flatMap((claim) => {
      const doc = state.documents.find((candidate) => candidate.url === claim.sourceUrl);
      return (doc?.images ?? []).filter((image) => {
        const corpus = `${image.title} ${image.altText ?? ""}`.toLowerCase();
        return [claim.remedyCanonical, ...claim.remedyAliases].some((alias) => corpus.includes(alias.toLowerCase()));
      });
    });

    let candidatePool = supportingDocImages.slice(0, state.plan!.targetImageResults);
    let bestImage = await chooseBestImage(remedy, candidatePool);

    if (!bestImage) {
      const perQueryTarget = Math.max(20, Math.ceil(state.plan!.targetImageResults / imageQueries.length));
      const searched = await Promise.all(imageQueries.map((query) => duckSearchService.searchRemedyImages(query, perQueryTarget)));
      candidatePool = [...supportingDocImages, ...searched.flat()].slice(0, state.plan!.targetImageResults);
      bestImage = await chooseBestImage(remedy, candidatePool);
    }

    withImages.push({ ...remedy, image: bestImage });
  }
  return {
    primaryRanked: withImages,
    notes: [
      ...state.notes,
      `Image ranking targeted up to ${state.plan!.targetImageResults} candidates per remedy when needed.`,
      "Image ranking combined reliable-source preference, lexical max-match, reference overlap, and optional vision verification.",
    ],
  };
};

export const reportNode = async (state: AgentStateType) => {
  const report = {
    runId: state.runId,
    generatedAt: new Date().toISOString(),
    query: state.input.query,
    status: (state.status === "out_of_scope" ? "out_of_scope" : "completed") as "completed" | "out_of_scope",
    disclaimer:
      "This agent summarizes the most reliable and potentially useful supportive options described across web and literature sources for the query. It does not claim cures, diagnosis, or guaranteed outcomes. Primary results are evidence-first. The secondary appendix reflects top web matches only and can overstate repeated low-quality content.",
    methodology: [
      `Expanded the query into multiple search families and targeted up to ${state.plan?.targetWebResults ?? 0} website links and ${state.plan?.targetImageResults ?? 0} image candidates per remedy when available.`,
      "Used open web discovery for official, hospital, traditional, and contradiction-search families, plus direct PubMed literature retrieval.",
      "Retrieved pages with direct fetch first and a browser fallback when needed.",
      "Extracted remedy mentions with heuristics and optional structured LLM extraction.",
      "Ranked options by evidence quality, independent source families, authority, safety profile, and query specificity.",
      "Ranked images by reliable source authority, textual max-match, consistency with extracted descriptions, and optional vision verification.",
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
    status: state.status === "out_of_scope" ? ("out_of_scope" as const) : ("completed" as const),
  };
};
