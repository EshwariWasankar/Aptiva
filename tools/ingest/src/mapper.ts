/**
 * Topic mapper (pipeline stage "Classify", Section 15.1 / 14.1 step 2).
 * Lower-cases and trims the phrase, checks topic_synonyms first, then
 * falls back to exact slug/name matches. Anything unmatched is queued —
 * never guessed (Section 14.1 rule).
 */

export interface MapperTopic {
  id: string;
  slug: string;
  name: string;
}

export function normalisePhrase(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface MapperInput {
  /** phrase (lower-cased, trimmed) → topicId, from topic_synonyms. */
  synonyms: ReadonlyMap<string, string>;
  topics: readonly MapperTopic[];
}

export function mapTopicText(phrase: string | null | undefined, input: MapperInput): string | null {
  if (!phrase) return null;
  const key = normalisePhrase(phrase);
  if (!key) return null;

  const direct = input.synonyms.get(key);
  if (direct) return direct;

  // Exact slug or name match (also covers seeded taxonomy without synonyms).
  const slugKey = key.replace(/\s+/g, '-');
  const hit = input.topics.find(
    (t) => normalisePhrase(t.slug) === slugKey || normalisePhrase(t.name) === key,
  );
  return hit?.id ?? null;
}

/** Small keyword fallback for DS-01 folder names → seeded taxonomy topics. */
const DS01_FOLDER_MAP: Record<string, string> = {
  percentage: 'percentages',
  'ratio and proportion': 'ratio-proportion',
  'ratio & proportion': 'ratio-proportion',
  'time and work': 'time-work',
  'time, speed and distance': 'time-speed-distance',
  'time speed distance': 'time-speed-distance',
  probability: 'probability',
  averages: 'averages',
  average: 'averages',
  'problem on ages': 'ages',
  ages: 'ages',
  'problems on train': 'time-speed-distance',
  'problem on train': 'time-speed-distance',
  trains: 'time-speed-distance',
  'profit & loss': 'profit-loss',
  'profit and loss': 'profit-loss',
  'profit-loss': 'profit-loss',
  'number system': 'number-system',
  partnership: 'partnership',
};

/**
 * Map a DS-01 top-level folder name to a topic slug using the curated
 * folder map first, then the generic mapper. Returns the slug (or null).
 */
export function mapDs01Folder(folder: string, input: MapperInput): string | null {
  const key = normalisePhrase(folder);
  const curated = DS01_FOLDER_MAP[key];
  if (curated) return curated;
  const id = mapTopicText(folder, input);
  return id ? (input.topics.find((t) => t.id === id)?.slug ?? null) : null;
}
