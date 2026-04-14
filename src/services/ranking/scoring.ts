import type { ExtractedClaim, Modality, RankedRemedy } from "../../types.js";
import { clamp, shortText, unique } from "../../utils/text.js";
import { domainAuthority } from "../retrieval/fetch.js";

const EVIDENCE_SCORES: Record<string, number> = {
  meta_analysis: 1,
  systematic_review: 0.95,
  rct: 0.8,
  official_guidance: 0.75,
  observational: 0.55,
  expert_patient_education: 0.45,
  traditional_text: 0.4,
  open_web: 0.15,
};

const MODALITY_SAFETY: Record<Modality, number> = {
  acupressure: 0.82,
  mudra: 0.86,
  yoga: 0.78,
  pranayama: 0.8,
  lifestyle: 0.83,
  ayurveda: 0.58,
};

const average = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export const rankClaims = (claims: ExtractedClaim[], topN: number): { primary: RankedRemedy[]; secondary: RankedRemedy[] } => {
  const grouped = new Map<string, ExtractedClaim[]>();
  for (const claim of claims) {
    const key = claim.remedyCanonical.toLowerCase();
    const bucket = grouped.get(key) ?? [];
    bucket.push(claim);
    grouped.set(key, bucket);
  }

  const occurrenceMax = Math.max(1, ...[...grouped.values()].map((bucket) => bucket.length));

  const remedies: RankedRemedy[] = [...grouped.values()].map((bucket) => {
    const first = bucket[0]!;
    const evidenceQuality = average(bucket.map((claim) => EVIDENCE_SCORES[claim.evidenceType] ?? 0.2));
    const independentDomainCount = unique(bucket.map((claim) => claim.sourceDomain)).length;
    const independentConsensus = clamp(independentDomainCount / 6);
    const authority = average(bucket.map((claim) => domainAuthority(claim.sourceDomain)));
    const safetyConfidence = clamp(
      average(bucket.map((claim) => claim.safetyNotes.length ? MODALITY_SAFETY[claim.modality] - 0.08 : MODALITY_SAFETY[claim.modality])),
    );
    const specificity = average(bucket.map((claim) => claim.querySpecificity));
    const occurrenceCount = bucket.length;
    const normalizedOccurrenceCount = clamp(occurrenceCount / occurrenceMax);
    const primaryScore =
      0.35 * evidenceQuality +
      0.25 * independentConsensus +
      0.15 * authority +
      0.15 * safetyConfidence +
      0.10 * specificity;
    const secondaryTopMatchScore =
      0.55 * normalizedOccurrenceCount +
      0.2 * independentConsensus +
      0.15 * authority +
      0.1 * specificity;

    const evidenceConfidence: RankedRemedy["evidenceConfidence"] =
      primaryScore >= 0.78 ? "high" : primaryScore >= 0.6 ? "moderate" : primaryScore >= 0.42 ? "low" : "insufficient";

    return {
      remedyCanonical: first.remedyCanonical,
      modality: first.modality,
      primaryScore: Number(primaryScore.toFixed(4)),
      secondaryTopMatchScore: Number(secondaryTopMatchScore.toFixed(4)),
      evidenceConfidence,
      independentDomainCount,
      occurrenceCount,
      rationale: [
        `Evidence quality average: ${evidenceQuality.toFixed(2)}`,
        `Independent source families: ${independentDomainCount}`,
        `Average source authority: ${authority.toFixed(2)}`,
        `Query relevance: ${specificity.toFixed(2)}`,
      ],
      instructionSummary: shortText(
        unique(bucket.map((claim) => claim.instructionSummary).filter(Boolean)).join(" "),
        500,
      ),
      safetySummary: unique(bucket.flatMap((claim) => claim.safetyNotes)).slice(0, 6),
      supportingClaims: bucket,
    };
  });

  const primary = remedies.sort((a, b) => b.primaryScore - a.primaryScore).slice(0, topN);
  const secondary = [...remedies].sort((a, b) => b.secondaryTopMatchScore - a.secondaryTopMatchScore).slice(0, topN);
  return { primary, secondary };
};
