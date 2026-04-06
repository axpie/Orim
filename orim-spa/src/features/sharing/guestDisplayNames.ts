const guestNameDictionaries = {
  de: {
    adjectives: [
      'Akribischer',
      'Wissbegieriger',
      'Hartnackiger',
      'Visionarer',
      'Pragmatischer',
      'Charmanter',
      'Neugieriger',
      'Unerschrockener',
      'Strategischer',
      'Findiger',
      'Eifriger',
      'Gelassener',
    ],
    roles: [
      'Softwaretester',
      'Marktforscher',
      'Cloudarchitekt',
      'Datenflusterer',
      'Sprintplaner',
      'IT-Detektiv',
      'Beratungsstratege',
      'Produktdenker',
      'Automatisierungsfan',
      'Funneloptimierer',
      'Releasekapitan',
      'Prozesszauberer',
    ],
  },
  en: {
    adjectives: [
      'Meticulous',
      'Curious',
      'Fearless',
      'Pragmatic',
      'Strategic',
      'Witty',
      'Relentless',
      'Observant',
      'Savvy',
      'Inventive',
      'Cheerful',
      'Methodical',
    ],
    roles: [
      'Software Tester',
      'Market Researcher',
      'Cloud Architect',
      'Data Whisperer',
      'Sprint Planner',
      'IT Detective',
      'Consulting Strategist',
      'Product Thinker',
      'Automation Enthusiast',
      'Funnel Optimizer',
      'Release Captain',
      'Process Wizard',
    ],
  },
} as const;

function normalizeLanguage(language?: string | null): keyof typeof guestNameDictionaries {
  return language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function isLegacyGuestDisplayName(name: string): boolean {
  return /^guest(?:\s+\d+)?$/i.test(name.trim());
}

export function buildRandomGuestDisplayName(language?: string | null): string {
  const dictionary = guestNameDictionaries[normalizeLanguage(language)];
  return `${pickRandom(dictionary.adjectives)} ${pickRandom(dictionary.roles)}`;
}

export function resolveInitialGuestDisplayName(language?: string | null, storedName?: string | null): string {
  const trimmedStoredName = storedName?.trim();
  if (trimmedStoredName && !isLegacyGuestDisplayName(trimmedStoredName)) {
    return trimmedStoredName;
  }

  return buildRandomGuestDisplayName(language);
}