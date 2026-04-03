import {
  mdiAbacus,
  mdiAccount,
  mdiAccountGroup,
  mdiApi,
  mdiApplicationBracketsOutline,
  mdiArchiveOutline,
  mdiArrowDecision,
  mdiBell,
  mdiBriefcaseOutline,
  mdiBug,
  mdiCalculatorVariantOutline,
  mdiCalendarMonthOutline,
  mdiCameraOutline,
  mdiCashMultiple,
  mdiChartBar,
  mdiCheckCircle,
  mdiCheckDecagram,
  mdiChip,
  mdiCloud,
  mdiCloudOutline,
  mdiCodeBraces,
  mdiCog,
  mdiCompassOutline,
  mdiCubeOutline,
  mdiDatabase,
  mdiDocker,
  mdiDomain,
  mdiEarth,
  mdiEmail,
  mdiFileDocumentOutline,
  mdiFileTreeOutline,
  mdiFire,
  mdiFolderOutline,
  mdiGit,
  mdiGoogleCloud,
  mdiHarddisk,
  mdiHeadCogOutline,
  mdiHomeOutline,
  mdiKeyOutline,
  mdiLan,
  mdiLaptop,
  mdiLightbulbOutline,
  mdiLock,
  mdiMagnify,
  mdiMapMarkerOutline,
  mdiMessageOutline,
  mdiMonitor,
  mdiNetworkOutline,
  mdiOfficeBuildingOutline,
  mdiPaletteOutline,
  mdiPhoneOutline,
  mdiPrinterOutline,
  mdiPuzzleOutline,
  mdiRobot,
  mdiRouterNetwork,
  mdiSafeSquareOutline,
  mdiServer,
  mdiServerNetwork,
  mdiShieldCheck,
  mdiSitemapOutline,
  mdiSourceBranch,
  mdiStar,
  mdiTableLarge,
  mdiTagOutline,
  mdiTextBoxOutline,
  mdiTimerOutline,
  mdiTools,
  mdiTruckDeliveryOutline,
  mdiWeb,
  mdiWebhook,
  mdiWifi,
} from '@mdi/js';

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

const ICON_PATHS: Record<string, string> = {
  'mdi-star': mdiStar,
  'mdi-account': mdiAccount,
  'mdi-account-group': mdiAccountGroup,
  'mdi-abacus': mdiAbacus,
  'mdi-api': mdiApi,
  'mdi-application-brackets-outline': mdiApplicationBracketsOutline,
  'mdi-archive-outline': mdiArchiveOutline,
  'mdi-arrow-decision': mdiArrowDecision,
  'mdi-bell': mdiBell,
  'mdi-bug': mdiBug,
  'mdi-briefcase-outline': mdiBriefcaseOutline,
  'mdi-calculator-variant-outline': mdiCalculatorVariantOutline,
  'mdi-calendar-month-outline': mdiCalendarMonthOutline,
  'mdi-camera-outline': mdiCameraOutline,
  'mdi-cash-multiple': mdiCashMultiple,
  'mdi-chart-bar': mdiChartBar,
  'mdi-check-circle': mdiCheckCircle,
  'mdi-check-decagram': mdiCheckDecagram,
  'mdi-chip': mdiChip,
  'mdi-cloud': mdiCloud,
  'mdi-cloud-outline': mdiCloudOutline,
  'mdi-code-braces': mdiCodeBraces,
  'mdi-cog': mdiCog,
  'mdi-compass-outline': mdiCompassOutline,
  'mdi-cube-outline': mdiCubeOutline,
  'mdi-database': mdiDatabase,
  'mdi-docker': mdiDocker,
  'mdi-domain': mdiDomain,
  'mdi-earth': mdiEarth,
  'mdi-email': mdiEmail,
  'mdi-file-document-outline': mdiFileDocumentOutline,
  'mdi-file-tree-outline': mdiFileTreeOutline,
  'mdi-fire': mdiFire,
  'mdi-folder-outline': mdiFolderOutline,
  'mdi-git': mdiGit,
  'mdi-google-cloud': mdiGoogleCloud,
  'mdi-harddisk': mdiHarddisk,
  'mdi-head-cog-outline': mdiHeadCogOutline,
  'mdi-home-outline': mdiHomeOutline,
  'mdi-key-outline': mdiKeyOutline,
  'mdi-lan': mdiLan,
  'mdi-laptop': mdiLaptop,
  'mdi-lightbulb-outline': mdiLightbulbOutline,
  'mdi-lock': mdiLock,
  'mdi-magnify': mdiMagnify,
  'mdi-map-marker-outline': mdiMapMarkerOutline,
  'mdi-message-outline': mdiMessageOutline,
  'mdi-monitor': mdiMonitor,
  'mdi-network-outline': mdiNetworkOutline,
  'mdi-office-building-outline': mdiOfficeBuildingOutline,
  'mdi-palette-outline': mdiPaletteOutline,
  'mdi-phone-outline': mdiPhoneOutline,
  'mdi-printer-outline': mdiPrinterOutline,
  'mdi-puzzle-outline': mdiPuzzleOutline,
  'mdi-robot': mdiRobot,
  'mdi-router-network': mdiRouterNetwork,
  'mdi-safe-square-outline': mdiSafeSquareOutline,
  'mdi-server': mdiServer,
  'mdi-server-network': mdiServerNetwork,
  'mdi-shield-check': mdiShieldCheck,
  'mdi-sitemap-outline': mdiSitemapOutline,
  'mdi-source-branch': mdiSourceBranch,
  'mdi-table-large': mdiTableLarge,
  'mdi-tag-outline': mdiTagOutline,
  'mdi-text-box-outline': mdiTextBoxOutline,
  'mdi-timer-outline': mdiTimerOutline,
  'mdi-tools': mdiTools,
  'mdi-truck-delivery-outline': mdiTruckDeliveryOutline,
  'mdi-web': mdiWeb,
  'mdi-webhook': mdiWebhook,
  'mdi-wifi': mdiWifi,
};

export const ICON_DEFINITIONS: IconDefinition[] = Object.entries(ICON_PATHS)
  .map(([name, path]) => ({
    name,
    label: iconNameToLabel(name),
    path,
    keywords: buildKeywords(name),
  }))
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

function iconNameToLabel(iconName: string): string {
  return iconName
    .replace(/^mdi-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function buildKeywords(iconName: string): string[] {
  const label = iconNameToLabel(iconName).toLowerCase();
  const parts = iconName.replace(/^mdi-/, '').split('-');
  return Array.from(new Set([...parts, ...label.split(/\s+/), ...(KEYWORD_OVERRIDES[iconName] ?? [])]));
}
