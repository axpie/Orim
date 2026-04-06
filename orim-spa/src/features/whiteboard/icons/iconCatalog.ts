import { GENERATED_ICON_DEFINITIONS, GENERATED_ICON_SOURCE_COUNTS } from './generated/fullIconCatalog';
import type {
  GeneratedIconCategoryKey,
  GeneratedIconDefinition,
  GeneratedIconNode,
  GeneratedIconSourceCounts,
} from './generated/generatedIconTypes';

export type IconGroupKey = GeneratedIconCategoryKey;
export type IconNode = GeneratedIconNode;
export type IconDefinition = GeneratedIconDefinition;

export interface IconGroupDefinition {
  key: IconGroupKey;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  iconName: string;
}

const LEGACY_ICON_GROUP_KEYS = new Set([
  'infrastructure',
  'software',
  'consulting',
  'security',
  'analytics',
  'navigation',
]);
const UPPERCASE_LABEL_PARTS = new Set([
  'ai',
  'api',
  'dns',
  'ev',
  'fps',
  'gps',
  'hd',
  'hdr',
  'id',
  'ios',
  'mp',
  'nfc',
  'qr',
  'ram',
  'rss',
  'sd',
  'sms',
  'sql',
  'svg',
  'tv',
  'ui',
  'usb',
  'ux',
  'vr',
  'vpn',
  'wifi',
]);

const ICON_GROUP_DEFINITIONS_STORAGE: readonly IconGroupDefinition[] = [
  {
    key: 'actions',
    labelKey: 'iconGroups.actions.label',
    defaultLabel: 'Actions',
    descriptionKey: 'iconGroups.actions.description',
    defaultDescription: 'Aktionen, Status und haeufige Bedienbefehle.',
    iconName: 'material-touch-app',
  },
  {
    key: 'activities',
    labelKey: 'iconGroups.activities.label',
    defaultLabel: 'Activities',
    descriptionKey: 'iconGroups.activities.description',
    defaultDescription: 'Sport, Freizeit, Outdoor und Aktivitaeten.',
    iconName: 'material-directions-run',
  },
  {
    key: 'android',
    labelKey: 'iconGroups.android.label',
    defaultLabel: 'Android',
    descriptionKey: 'iconGroups.android.description',
    defaultDescription: 'Android, mobile Plattformen und Geraetezustand.',
    iconName: 'material-android',
  },
  {
    key: 'audio-video',
    labelKey: 'iconGroups.audioVideo.label',
    defaultLabel: 'Audio & Video',
    descriptionKey: 'iconGroups.audioVideo.description',
    defaultDescription: 'Medien, Aufnahme, Wiedergabe und Streaming.',
    iconName: 'material-play-circle',
  },
  {
    key: 'business',
    labelKey: 'iconGroups.business.label',
    defaultLabel: 'Business',
    descriptionKey: 'iconGroups.business.description',
    defaultDescription: 'Business, Finanzen, Organisation und Arbeit.',
    iconName: 'material-business-center',
  },
  {
    key: 'communicate',
    labelKey: 'iconGroups.communicate.label',
    defaultLabel: 'Communicate',
    descriptionKey: 'iconGroups.communicate.description',
    defaultDescription: 'Chat, E-Mail, Calls und Zusammenarbeit.',
    iconName: 'material-forum',
  },
  {
    key: 'hardware',
    labelKey: 'iconGroups.hardware.label',
    defaultLabel: 'Hardware',
    descriptionKey: 'iconGroups.hardware.description',
    defaultDescription: 'Hardware, Computer, Netzwerke und Infrastruktur.',
    iconName: 'material-memory',
  },
  {
    key: 'home',
    labelKey: 'iconGroups.home.label',
    defaultLabel: 'Home',
    descriptionKey: 'iconGroups.home.description',
    defaultDescription: 'Wohnen, Gebaeude und Wohnbereiche.',
    iconName: 'material-home',
  },
  {
    key: 'household',
    labelKey: 'iconGroups.household.label',
    defaultLabel: 'Household',
    descriptionKey: 'iconGroups.household.description',
    defaultDescription: 'Haushalt, Kueche, Reinigung und Alltag.',
    iconName: 'material-kitchen',
  },
  {
    key: 'images',
    labelKey: 'iconGroups.images.label',
    defaultLabel: 'Images',
    descriptionKey: 'iconGroups.images.description',
    defaultDescription: 'Bilder, Foto, Galerie und Gestaltung.',
    iconName: 'material-image',
  },
  {
    key: 'maps',
    labelKey: 'iconGroups.maps.label',
    defaultLabel: 'Maps',
    descriptionKey: 'iconGroups.maps.description',
    defaultDescription: 'Karten, Orte, Pins und Navigation.',
    iconName: 'material-map',
  },
  {
    key: 'privacy',
    labelKey: 'iconGroups.privacy.label',
    defaultLabel: 'Privacy',
    descriptionKey: 'iconGroups.privacy.description',
    defaultDescription: 'Sicherheit, Datenschutz, Freigaben und Schutz.',
    iconName: 'material-shield',
  },
  {
    key: 'social',
    labelKey: 'iconGroups.social.label',
    defaultLabel: 'Social',
    descriptionKey: 'iconGroups.social.description',
    defaultDescription: 'Personen, Teams, Profile und Communities.',
    iconName: 'material-groups',
  },
  {
    key: 'text',
    labelKey: 'iconGroups.text.label',
    defaultLabel: 'Text',
    descriptionKey: 'iconGroups.text.description',
    defaultDescription: 'Text, Dokumente, Schreiben und Formatierung.',
    iconName: 'material-text-fields',
  },
  {
    key: 'transit',
    labelKey: 'iconGroups.transit.label',
    defaultLabel: 'Transit',
    descriptionKey: 'iconGroups.transit.description',
    defaultDescription: 'Oeffentlicher Verkehr, Fahrzeuge und Transport.',
    iconName: 'material-train',
  },
  {
    key: 'travel',
    labelKey: 'iconGroups.travel.label',
    defaultLabel: 'Travel',
    descriptionKey: 'iconGroups.travel.description',
    defaultDescription: 'Reisen, Urlaub, Flug und unterwegs sein.',
    iconName: 'material-flight',
  },
  {
    key: 'ui-actions',
    labelKey: 'iconGroups.uiActions.label',
    defaultLabel: 'UI actions',
    descriptionKey: 'iconGroups.uiActions.description',
    defaultDescription: 'Menues, Suche, Filter, Layout und Interaktionen.',
    iconName: 'material-menu',
  },
] as const;

const ICON_GROUP_KEYS = new Set(ICON_GROUP_DEFINITIONS_STORAGE.map((group) => group.key));

export const ICON_GROUP_DEFINITIONS = ICON_GROUP_DEFINITIONS_STORAGE;
export const DEFAULT_ICON_GROUP_KEYS = ICON_GROUP_DEFINITIONS_STORAGE.map((group) => group.key);
export const ICON_DEFINITIONS: IconDefinition[] = GENERATED_ICON_DEFINITIONS;
export const ICON_SOURCE_COUNTS: GeneratedIconSourceCounts = GENERATED_ICON_SOURCE_COUNTS;

const ICON_LOOKUP = new Map(ICON_DEFINITIONS.map((icon) => [icon.name, icon]));

export function getIconDefinition(iconName?: string | null): IconDefinition | null {
  if (!iconName) {
    return null;
  }

  return ICON_LOOKUP.get(iconName) ?? null;
}

export function getEnabledIconGroupDefinitions(enabledGroupKeys?: readonly string[] | null): IconGroupDefinition[] {
  const enabled = new Set(resolveEnabledIconGroupKeys(enabledGroupKeys));
  return ICON_GROUP_DEFINITIONS_STORAGE.filter((group) => enabled.has(group.key));
}

export function resolveEnabledIconGroupKeys(enabledGroupKeys?: readonly string[] | null): IconGroupKey[] {
  if (enabledGroupKeys == null) {
    return [...DEFAULT_ICON_GROUP_KEYS];
  }

  const normalizedKeys = Array.from(new Set(
    enabledGroupKeys
      .map((groupKey) => groupKey.trim())
      .filter((groupKey) => groupKey.length > 0),
  ));

  if (normalizedKeys.length === 0) {
    return [];
  }

  const validKeys = normalizedKeys.filter((groupKey): groupKey is IconGroupKey => ICON_GROUP_KEYS.has(groupKey as IconGroupKey));
  if (validKeys.length > 0) {
    return validKeys;
  }

  const hasLegacyKeys = normalizedKeys.some((groupKey) => LEGACY_ICON_GROUP_KEYS.has(groupKey.toLowerCase()));
  return hasLegacyKeys ? [...DEFAULT_ICON_GROUP_KEYS] : [];
}

export function filterIconDefinitions(
  search: string,
  options?: {
    enabledGroupKeys?: readonly string[] | null;
    activeGroupKey?: IconGroupKey | 'all' | null;
    limit?: number | null;
  },
): IconDefinition[] {
  const query = normalizeSearch(search);
  const queryTokens = query.length > 0 ? query.split(' ').filter(Boolean) : [];
  const enabledGroups = new Set(resolveEnabledIconGroupKeys(options?.enabledGroupKeys));
  const activeGroupKey = options?.activeGroupKey ?? 'all';

  const filtered = ICON_DEFINITIONS.filter((icon) => {
    const matchesEnabledGroups = icon.groupKeys.some((groupKey) => enabledGroups.has(groupKey));
    if (!matchesEnabledGroups) {
      return false;
    }

    if (activeGroupKey !== 'all' && !icon.groupKeys.includes(activeGroupKey)) {
      return false;
    }

    if (queryTokens.length === 0) {
      return true;
    }

    return queryTokens.every((token) => icon.searchText.includes(token));
  });

  if (options?.limit != null) {
    return filtered.slice(0, options.limit);
  }

  return filtered;
}

export function getIconDisplayName(iconName?: string | null): string {
  const icon = getIconDefinition(iconName);
  if (icon) {
    return icon.label;
  }

  return iconNameToLabel(iconName ?? 'Icon');
}

function normalizeSearch(search: string): string {
  return search
    .trim()
    .toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function iconNameToLabel(iconName: string): string {
  return stripIconPrefix(iconName)
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (/^\d+[a-z]$/i.test(part)) {
        return `${part.slice(0, -1)}${part.slice(-1).toUpperCase()}`;
      }

      if (part.length === 1 || UPPERCASE_LABEL_PARTS.has(part.toLowerCase())) {
        return part.toUpperCase();
      }

      return part[0].toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function stripIconPrefix(iconName: string): string {
  return iconName.replace(/^(mdi|material)-/, '');
}
