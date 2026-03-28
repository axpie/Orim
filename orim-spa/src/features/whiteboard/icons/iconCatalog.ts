import * as mdiIcons from '@mdi/js';

export interface IconDefinition {
  name: string;
  label: string;
  path: string;
  keywords: string[];
}

const PREFERRED_ICON_NAMES = new Set([
  'mdi-star',
  'mdi-account',
  'mdi-account-group',
  'mdi-abacus',
  'mdi-api',
  'mdi-application-brackets-outline',
  'mdi-archive-outline',
  'mdi-arrow-decision',
  'mdi-bell',
  'mdi-bug',
  'mdi-briefcase-outline',
  'mdi-calculator-variant-outline',
  'mdi-calendar-month-outline',
  'mdi-camera-outline',
  'mdi-cash-multiple',
  'mdi-chart-bar',
  'mdi-check-circle',
  'mdi-check-decagram',
  'mdi-chip',
  'mdi-cloud',
  'mdi-cloud-outline',
  'mdi-code-braces',
  'mdi-cog',
  'mdi-compass-outline',
  'mdi-cube-outline',
  'mdi-database',
  'mdi-docker',
  'mdi-domain',
  'mdi-earth',
  'mdi-email',
  'mdi-file-document-outline',
  'mdi-file-tree-outline',
  'mdi-fire',
  'mdi-folder-outline',
  'mdi-git',
  'mdi-google-cloud',
  'mdi-harddisk',
  'mdi-head-cog-outline',
  'mdi-home-outline',
  'mdi-key-outline',
  'mdi-lan',
  'mdi-laptop',
  'mdi-lightbulb-outline',
  'mdi-lock',
  'mdi-magnify',
  'mdi-map-marker-outline',
  'mdi-message-outline',
  'mdi-monitor',
  'mdi-network-outline',
  'mdi-office-building-outline',
  'mdi-palette-outline',
  'mdi-phone-outline',
  'mdi-printer-outline',
  'mdi-puzzle-outline',
  'mdi-robot',
  'mdi-router-network',
  'mdi-safe-square-outline',
  'mdi-server',
  'mdi-server-network',
  'mdi-shield-check',
  'mdi-sitemap-outline',
  'mdi-source-branch',
  'mdi-table-large',
  'mdi-tag-outline',
  'mdi-text-box-outline',
  'mdi-timer-outline',
  'mdi-tools',
  'mdi-truck-delivery-outline',
  'mdi-web',
  'mdi-webhook',
  'mdi-wifi',
]);

const KEYWORD_OVERRIDES: Record<string, string[]> = {
  'mdi-account': ['user', 'person', 'profile'],
  'mdi-account-group': ['team', 'users', 'people'],
  'mdi-api': ['endpoint', 'integration', 'rest'],
  'mdi-bell': ['notification', 'alert'],
  'mdi-bug': ['issue', 'defect'],
  'mdi-chart-bar': ['analytics', 'report'],
  'mdi-cloud': ['hosting', 'saas'],
  'mdi-code-braces': ['json', 'development'],
  'mdi-cog': ['settings', 'gear', 'config'],
  'mdi-database': ['storage', 'sql'],
  'mdi-docker': ['container'],
  'mdi-email': ['mail', 'message'],
  'mdi-file-document-outline': ['document', 'file', 'doc'],
  'mdi-folder-outline': ['directory', 'project'],
  'mdi-git': ['source', 'version'],
  'mdi-key-outline': ['password', 'auth'],
  'mdi-lan': ['network', 'infrastructure', 'switch'],
  'mdi-lock': ['security', 'auth'],
  'mdi-monitor': ['screen', 'display'],
  'mdi-robot': ['ai', 'automation'],
  'mdi-router-network': ['network', 'gateway'],
  'mdi-server': ['backend', 'host'],
  'mdi-server-network': ['backend', 'cluster'],
  'mdi-shield-check': ['policy', 'protection'],
  'mdi-source-branch': ['git', 'flow'],
  'mdi-web': ['browser', 'frontend'],
  'mdi-webhook': ['integration', 'event'],
  'mdi-wifi': ['wireless', 'signal'],
};

export const ICON_DEFINITIONS: IconDefinition[] = Object.entries(mdiIcons)
  .filter(([exportName, value]) => exportName.startsWith('mdi') && typeof value === 'string')
  .map(([exportName, path]) => {
    const name = exportNameToIconName(exportName);
    return {
      name,
      label: exportNameToLabel(exportName),
      path,
      keywords: buildKeywords(name, exportName),
    } satisfies IconDefinition;
  })
  .sort((left, right) => {
    const leftPreferred = PREFERRED_ICON_NAMES.has(left.name);
    const rightPreferred = PREFERRED_ICON_NAMES.has(right.name);

    if (leftPreferred !== rightPreferred) {
      return leftPreferred ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

const ICON_LOOKUP = new Map(ICON_DEFINITIONS.map((icon) => [icon.name, icon]));

export function getIconDefinition(iconName?: string | null): IconDefinition | null {
  if (!iconName) {
    return null;
  }

  return ICON_LOOKUP.get(iconName) ?? null;
}

export function filterIconDefinitions(search: string): IconDefinition[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return ICON_DEFINITIONS.slice(0, 240);
  }

  return ICON_DEFINITIONS.filter((icon) => {
    const haystack = [icon.name, icon.label, ...icon.keywords].join(' ').toLowerCase();
    return haystack.includes(query);
  }).slice(0, 400);
}

export function getIconDisplayName(iconName?: string | null): string {
  const icon = getIconDefinition(iconName);
  if (icon) {
    return icon.label;
  }

  return (iconName ?? 'Icon')
    .replace(/^mdi-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function exportNameToIconName(exportName: string): string {
  return `mdi-${exportName
    .slice(3)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`;
}

function exportNameToLabel(exportName: string): string {
  return exportName
    .slice(3)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function buildKeywords(iconName: string, exportName: string): string[] {
  const label = exportNameToLabel(exportName).toLowerCase();
  const parts = iconName.replace(/^mdi-/, '').split('-');
  return Array.from(new Set([...parts, ...label.split(/\s+/), ...(KEYWORD_OVERRIDES[iconName] ?? [])]));
}