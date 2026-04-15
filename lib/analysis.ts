export type Severity = 'low' | 'medium' | 'high';

export type ModelProvider = 'gemini' | 'ollama' | 'browser';

export interface AnalysisListItem {
  title: string;
  evidence: string;
  severity: Severity;
}

export interface HiddenFee extends AnalysisListItem {
  estimatedCost: string;
}

export interface RiskyClause extends AnalysisListItem {
  explanation: string;
}

export interface AnalysisResult {
  fitScore: number;
  overallVerdict: string;
  summary: string;
  hiddenFees: HiddenFee[];
  riskyClauses: RiskyClause[];
  commuteSummary: string;
  areaPros: string[];
  areaCons: string[];
  budgetFit: string;
  questionsToAsk: string[];
  landlordEmailDraft: string;
}

export interface AnalysisInput {
  propertyAddress: string;
  listingUrl: string;
  listingText: string;
  destination: string;
  budget: string;
  pdfText?: string;
}

export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    fitScore: { type: 'number' },
    overallVerdict: { type: 'string' },
    summary: { type: 'string' },
    hiddenFees: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          estimatedCost: { type: 'string' },
          evidence: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['title', 'estimatedCost', 'evidence', 'severity'],
      },
    },
    riskyClauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          evidence: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['title', 'explanation', 'evidence', 'severity'],
      },
    },
    commuteSummary: { type: 'string' },
    areaPros: {
      type: 'array',
      items: { type: 'string' },
    },
    areaCons: {
      type: 'array',
      items: { type: 'string' },
    },
    budgetFit: { type: 'string' },
    questionsToAsk: {
      type: 'array',
      items: { type: 'string' },
    },
    landlordEmailDraft: { type: 'string' },
  },
  required: [
    'fitScore',
    'overallVerdict',
    'summary',
    'hiddenFees',
    'riskyClauses',
    'commuteSummary',
    'areaPros',
    'areaCons',
    'budgetFit',
    'questionsToAsk',
    'landlordEmailDraft',
  ],
} as const;

const JSON_FENCE_REGEX = /```(?:json)?|```/g;
const THINK_TAG_REGEX = /<\|channel\|>thought[\s\S]*?<channel\|>/gi;
const XML_THINK_REGEX = /<think>[\s\S]*?<\/think>/gi;

function clipText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[Content truncated after ${maxLength} characters for local inference.]`;
}

export function getProviderLabel(provider: ModelProvider) {
  switch (provider) {
    case 'gemini':
      return 'Gemini';
    case 'ollama':
      return 'Ollama';
    case 'browser':
      return 'Browser Gemma 4';
    default:
      return 'Model';
  }
}

export function providerSupportsLiveLookup(provider: ModelProvider) {
  return provider === 'gemini';
}

export function buildLocalAnalysisPrompt(input: AnalysisInput) {
  const listingText = clipText(input.listingText.trim() || 'Not provided', 8_000);
  const pdfText = clipText(input.pdfText?.trim() || 'Not provided', 20_000);
  const schemaText = JSON.stringify(ANALYSIS_JSON_SCHEMA, null, 2);

  return [
    'You are LeaseLens, an expert tenant advocate and neighborhood analyst.',
    'Return exactly one JSON object that matches the schema below.',
    'Only mention hidden fees and risky clauses that are supported by the provided listing text or lease text.',
    'Use the provided property address as the primary source of location truth when it is available.',
    'If the listing and property address do not provide enough location detail to assess the neighborhood or commute, say so clearly and lower confidence instead of inventing facts.',
    'Use plain English, keep the landlord email professional, and make the fitScore a number from 0 to 100.',
    `JSON schema:\n${schemaText}`,
    `User constraints:\n- Monthly budget: $${input.budget}\n- Destination: ${input.destination}`,
    `Property address:\n${input.propertyAddress || 'Not provided'}`,
    `Listing URL:\n${input.listingUrl || 'Not provided'}`,
    `Listing text:\n${listingText}`,
    `Lease text extracted from PDF:\n${pdfText}`,
    'Output only raw JSON. Do not add markdown, code fences, explanations, or thinking traces.',
  ].join('\n\n');
}

function findBalancedJSONObject(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseJSONFromModelOutput(text: string) {
  const cleaned = text
    .replace(JSON_FENCE_REGEX, '')
    .replace(THINK_TAG_REGEX, '')
    .replace(XML_THINK_REGEX, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = findBalancedJSONObject(cleaned);

    if (!extracted) {
      throw new Error('The model did not return valid JSON.');
    }

    return JSON.parse(extracted);
  }
}

function toSeverity(value: unknown): Severity {
  if (typeof value !== 'string') {
    return 'low';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }

  return 'low';
}

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeHiddenFees(value: unknown): HiddenFee[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: toStringValue(item.title, 'Unnamed fee'),
      estimatedCost: toStringValue(item.estimatedCost, 'Not specified'),
      evidence: toStringValue(item.evidence, 'No evidence provided.'),
      severity: toSeverity(item.severity),
    }));
}

function normalizeRiskyClauses(value: unknown): RiskyClause[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: toStringValue(item.title, 'Unnamed clause'),
      explanation: toStringValue(item.explanation, 'No explanation provided.'),
      evidence: toStringValue(item.evidence, 'No evidence provided.'),
      severity: toSeverity(item.severity),
    }));
}

function normalizeFitScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeAnalysisResult(value: unknown): AnalysisResult {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    fitScore: normalizeFitScore(raw.fitScore),
    overallVerdict: toStringValue(raw.overallVerdict, 'No verdict returned.'),
    summary: toStringValue(raw.summary, 'No summary returned.'),
    hiddenFees: normalizeHiddenFees(raw.hiddenFees),
    riskyClauses: normalizeRiskyClauses(raw.riskyClauses),
    commuteSummary: toStringValue(raw.commuteSummary, 'Commute analysis was not available.'),
    areaPros: toStringArray(raw.areaPros),
    areaCons: toStringArray(raw.areaCons),
    budgetFit: toStringValue(raw.budgetFit, 'Budget fit analysis was not available.'),
    questionsToAsk: toStringArray(raw.questionsToAsk),
    landlordEmailDraft: toStringValue(raw.landlordEmailDraft, 'No landlord email draft returned.'),
  };
}
