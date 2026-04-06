import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const mdiIcons = require('@mdi/js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const metadataDir = path.join(projectRoot, 'scripts', 'icon-metadata');
const generatedDir = path.join(projectRoot, 'src', 'features', 'whiteboard', 'icons', 'generated');
const outputPath = path.join(generatedDir, 'fullIconCatalog.ts');
const googleMetadataPath = path.join(metadataDir, 'google-icons.json');
const mdiMetadataPath = path.join(metadataDir, 'mdi-meta.json');

const CATEGORY_DEFINITIONS = [
  { key: 'actions', label: 'Actions' },
  { key: 'activities', label: 'Activities' },
  { key: 'android', label: 'Android' },
  { key: 'audio-video', label: 'Audio & Video' },
  { key: 'business', label: 'Business' },
  { key: 'communicate', label: 'Communicate' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'home', label: 'Home' },
  { key: 'household', label: 'Household' },
  { key: 'images', label: 'Images' },
  { key: 'maps', label: 'Maps' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'social', label: 'Social' },
  { key: 'text', label: 'Text' },
  { key: 'transit', label: 'Transit' },
  { key: 'travel', label: 'Travel' },
  { key: 'ui-actions', label: 'UI actions' },
];

const CATEGORY_KEYS = new Set(CATEGORY_DEFINITIONS.map((category) => category.key));
const FALLBACK_CATEGORY_KEY = 'actions';
const REACT_FRAGMENT = Symbol.for('react.fragment');
const NUMBER_WORDS = new Map([
  ['zero', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['ten', '10'],
  ['eleven', '11'],
  ['twelve', '12'],
  ['thirteen', '13'],
  ['fourteen', '14'],
  ['fifteen', '15'],
  ['sixteen', '16'],
  ['seventeen', '17'],
  ['eighteen', '18'],
  ['nineteen', '19'],
  ['twenty', '20'],
  ['thirty', '30'],
  ['forty', '40'],
  ['fifty', '50'],
  ['sixty', '60'],
  ['seventy', '70'],
  ['eighty', '80'],
  ['ninety', '90'],
]);
const GOOGLE_UNIT_TOKENS = new Set(['d', 'fps', 'g', 'k', 'mp', 'x']);
const RAW_GOOGLE_CATEGORY_MAP = new Map([
  ['action', 'actions'],
  ['actions', 'actions'],
  ['activities', 'activities'],
  ['activity', 'activities'],
  ['android', 'android'],
  ['audioandvideo', 'audio-video'],
  ['av', 'audio-video'],
  ['business', 'business'],
  ['communicate', 'communicate'],
  ['communication', 'communicate'],
  ['content', 'ui-actions'],
  ['device', 'hardware'],
  ['editor', 'text'],
  ['hardware', 'hardware'],
  ['home', 'home'],
  ['household', 'household'],
  ['image', 'images'],
  ['images', 'images'],
  ['maps', 'maps'],
  ['navigation', 'maps'],
  ['notification', 'actions'],
  ['places', 'travel'],
  ['privacy', 'privacy'],
  ['social', 'social'],
  ['text', 'text'],
  ['toggle', 'ui-actions'],
  ['transit', 'transit'],
  ['travel', 'travel'],
  ['uiactions', 'ui-actions'],
]);
const MANUAL_CATEGORY_KEYWORDS = {
  actions: ['action', 'add', 'apply', 'arrow', 'change', 'check', 'close', 'delete', 'download', 'edit', 'favorite', 'filter', 'open', 'remove', 'save', 'settings', 'share', 'sort', 'upload'],
  activities: ['activity', 'adventure', 'bike', 'fitness', 'gym', 'hike', 'medal', 'outdoor', 'run', 'sport', 'sports', 'swim', 'trophy', 'walk', 'wellness'],
  android: ['android', 'google assistant', 'material', 'robot'],
  'audio-video': ['audio', 'camera', 'cast', 'film', 'headphone', 'headset', 'media', 'microphone', 'mic', 'movie', 'music', 'radio', 'speaker', 'tv', 'video'],
  business: ['bank', 'briefcase', 'broker', 'business', 'cash', 'chart', 'company', 'finance', 'meeting', 'money', 'office', 'organization', 'sales', 'store', 'work'],
  communicate: ['call', 'chat', 'comment', 'communicate', 'contact', 'email', 'forum', 'mail', 'message', 'phone', 'send', 'sms'],
  hardware: ['battery', 'chip', 'computer', 'device', 'hardware', 'headphones', 'keyboard', 'laptop', 'memory', 'monitor', 'mouse', 'network', 'phone', 'printer', 'router', 'screen', 'server', 'tablet', 'usb', 'watch', 'wifi'],
  home: ['apartment', 'bed', 'building', 'garage', 'home', 'house', 'living room', 'mortgage', 'real estate', 'residence'],
  household: ['appliance', 'bath', 'bathroom', 'clean', 'cleaning', 'dish', 'furniture', 'household', 'kitchen', 'laundry', 'sofa', 'utensil', 'vacuum'],
  images: ['art', 'brush', 'camera', 'crop', 'gallery', 'image', 'images', 'paint', 'palette', 'photo', 'photography', 'picture', 'video camera'],
  maps: ['compass', 'direction', 'earth', 'globe', 'gps', 'location', 'map', 'marker', 'navigation', 'pin', 'route'],
  privacy: ['auth', 'certificate', 'fingerprint', 'key', 'lock', 'password', 'policy', 'privacy', 'protection', 'safety', 'secure', 'security', 'shield', 'verified'],
  social: ['account', 'avatar', 'community', 'family', 'friend', 'group', 'people', 'person', 'profile', 'public', 'social', 'team', 'user', 'users'],
  text: ['article', 'book', 'caption', 'character', 'document', 'file', 'font', 'format', 'letter', 'numbers', 'paragraph', 'spell', 'subject', 'text', 'title', 'translate', 'typography', 'writing'],
  transit: ['bike', 'bus', 'car', 'commute', 'commuter', 'ferry', 'rail', 'station', 'subway', 'train', 'tram', 'transit', 'transport', 'vehicle'],
  travel: ['airplane', 'airport', 'beach', 'camp', 'flight', 'holiday', 'hotel', 'luggage', 'passport', 'plane', 'route', 'suitcase', 'tour', 'travel', 'trip', 'vacation'],
  'ui-actions': ['arrow', 'collapse', 'dashboard', 'drag', 'expand', 'fullscreen', 'gesture', 'grid', 'hamburger', 'keyboard', 'layout', 'menu', 'mouse', 'panel', 'search', 'swipe', 'touch', 'ui', 'view'],
};
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

async function main() {
  await fs.mkdir(generatedDir, { recursive: true });

  const [googleMetadata, mdiMetadata] = await Promise.all([
    readJsonFile(googleMetadataPath),
    readJsonFile(mdiMetadataPath),
  ]);

  const googleEntries = selectLatestGoogleEntries(googleMetadata.icons ?? []);
  const googleEntryByName = new Map(googleEntries.map((entry) => [entry.name, entry]));
  const categoryModel = buildCategoryModel(googleEntries);

  const googleDefinitions = await buildGoogleDefinitions(googleEntryByName, categoryModel);
  const mdiDefinitions = buildMdiDefinitions(mdiMetadata, categoryModel);
  const combinedDefinitions = [...googleDefinitions, ...mdiDefinitions].sort((left, right) => {
    if (left.rank !== right.rank) {
      return right.rank - left.rank;
    }

    return left.label.localeCompare(right.label);
  });

  const definitionsJson = JSON.stringify(combinedDefinitions);
  const fileContents = `// Generated by scripts/generate-icon-catalog.mjs. Do not edit manually.\nimport type { GeneratedIconDefinition, GeneratedIconSourceCounts } from './generatedIconTypes';\n\nconst generatedDefinitionsJson = ${JSON.stringify(definitionsJson)};\n\nexport const GENERATED_ICON_SOURCE_COUNTS: GeneratedIconSourceCounts = ${JSON.stringify({ material: googleDefinitions.length, mdi: mdiDefinitions.length })};\n\nexport const GENERATED_ICON_DEFINITIONS = JSON.parse(generatedDefinitionsJson) as GeneratedIconDefinition[];\n`;
  await fs.writeFile(outputPath, fileContents, 'utf8');

  console.log(`Generated ${combinedDefinitions.length} icons (${googleDefinitions.length} Google Material, ${mdiDefinitions.length} MDI).`);
}

async function readJsonFile(filePath) {
  let text;

  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Missing local icon metadata file: ${filePath}`);
    }

    throw error;
  }

  const normalized = text.startsWith(')]}\'')
    ? text.slice(text.indexOf('\n') + 1)
    : text;

  return JSON.parse(normalized);
}

function selectLatestGoogleEntries(entries) {
  const latestByName = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') {
      continue;
    }

    const groupKeys = mapGoogleCategories(entry.categories);
    if (groupKeys.length === 0) {
      continue;
    }

    const current = latestByName.get(entry.name);
    const currentVersion = Number(current?.version ?? -1);
    const nextVersion = Number(entry.version ?? -1);

    if (!current || nextVersion > currentVersion) {
      latestByName.set(entry.name, {
        ...entry,
        groupKeys,
      });
    }
  }

  return [...latestByName.values()];
}

async function buildGoogleDefinitions(googleEntryByName, categoryModel) {
  const muiDir = path.join(projectRoot, 'node_modules', '@mui', 'icons-material');
  const fileNames = (await fs.readdir(muiDir))
    .filter((fileName) => fileName.endsWith('.js'))
    .filter((fileName) => fileName !== 'index.js')
    .filter((fileName) => !/(Outlined|Rounded|Sharp|TwoTone)\.js$/.test(fileName));

  const definitions = [];

  for (const fileName of fileNames) {
    const moduleName = fileName.replace(/\.js$/, '');
    const metadataEntry = resolveGoogleMetadata(moduleName, googleEntryByName);
    const renderedIcon = require(`@mui/icons-material/${moduleName}`).default;
    const svgElement = renderedIcon.type.render({}, null);
    const nodes = flattenIconNodes(svgElement.props.children);
    const metadataName = metadataEntry?.name ?? buildDelimitedName(moduleName, '_');
    const sourceName = `material-${metadataName.replace(/_/g, '-')}`;
    const label = metadataEntry ? labelFromDelimitedName(metadataEntry.name) : labelFromPascalCase(moduleName);
    const groupKeys = metadataEntry?.groupKeys ?? classifyCategories(buildTokenSet(
      moduleName,
      metadataName,
      label,
    ), categoryModel);

    definitions.push({
      name: sourceName,
      label,
      rank: Number(metadataEntry?.popularity ?? 0),
      searchText: buildSearchText([
        metadataName,
        label,
        ...(metadataEntry?.tags ?? []),
        ...groupKeys,
      ]),
      groupKeys,
      nodes,
    });
  }

  return definitions;
}

function buildMdiDefinitions(mdiMetadataEntries, categoryModel) {
  const mdiMetadataByName = new Map(mdiMetadataEntries.map((entry) => [entry.name, entry]));
  const definitions = [];

  for (const [exportName, pathData] of Object.entries(mdiIcons)) {
    if (!exportName.startsWith('mdi') || typeof pathData !== 'string') {
      continue;
    }

    const exportBaseName = exportName.slice(3);
    const metadataEntry = resolveMdiMetadata(exportBaseName, mdiMetadataByName);
    const iconName = metadataEntry?.name ?? buildDelimitedName(exportBaseName, '-');
    const tokens = buildTokenSet(
      exportBaseName,
      iconName,
      ...(metadataEntry?.aliases ?? []),
      ...(metadataEntry?.styles ?? []),
      ...(metadataEntry?.tags ?? []),
    );

    definitions.push({
      name: `mdi-${iconName}`,
      label: labelFromDelimitedName(iconName),
      rank: 0,
      searchText: Array.from(tokens).sort().join(' '),
      groupKeys: classifyCategories(tokens, categoryModel),
      nodes: [{ type: 'path', d: pathData }],
    });
  }

  return definitions;
}

function resolveGoogleMetadata(moduleName, googleEntryByName) {
  for (const candidate of buildGoogleNameCandidates(moduleName)) {
    const entry = googleEntryByName.get(candidate);
    if (entry) {
      return entry;
    }
  }

  return null;
}

function resolveMdiMetadata(exportBaseName, mdiMetadataByName) {
  for (const candidate of buildDelimitedCandidates(exportBaseName, '-')) {
    const entry = mdiMetadataByName.get(candidate);
    if (entry) {
      return entry;
    }
  }

  return null;
}

function buildGoogleNameCandidates(moduleName) {
  return buildDelimitedCandidates(moduleName, '_');
}

function buildDelimitedCandidates(pascalName, separator) {
  const tokens = splitPascalCase(pascalName).map((token) => token.toLowerCase());
  const numericTokens = tokens.map((token) => NUMBER_WORDS.get(token) ?? token);
  const compactedTokens = compactNumericTokens(numericTokens);
  const candidates = new Set([
    tokens.join(separator),
    numericTokens.join(separator),
    compactedTokens.join(separator),
  ]);

  return [...candidates].filter(Boolean);
}

function compactNumericTokens(tokens) {
  const compacted = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (/^\d+$/.test(token)) {
      let merged = token;

      while (index + 1 < tokens.length && /^\d+$/.test(tokens[index + 1])) {
        merged += tokens[index + 1];
        index += 1;
      }

      if (index + 1 < tokens.length && (tokens[index + 1].length === 1 || GOOGLE_UNIT_TOKENS.has(tokens[index + 1]))) {
        merged += tokens[index + 1];
        index += 1;
      }

      compacted.push(merged);
      continue;
    }

    compacted.push(token);
  }

  return compacted;
}

function splitPascalCase(value) {
  return value.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g) ?? [value];
}

function flattenIconNodes(children) {
  const nodes = [];

  visitReactNode(children, nodes);

  if (nodes.length === 0) {
    throw new Error('Encountered icon without any supported SVG nodes.');
  }

  return nodes;
}

function visitReactNode(child, nodes) {
  if (child == null || typeof child === 'boolean') {
    return;
  }

  if (Array.isArray(child)) {
    for (const item of child) {
      visitReactNode(item, nodes);
    }
    return;
  }

  if (typeof child !== 'object') {
    return;
  }

  if (child.type === React.Fragment || child.type === REACT_FRAGMENT || child.type === 'g') {
    visitReactNode(child.props?.children, nodes);
    return;
  }

  if (child.type === 'path') {
    if (typeof child.props?.d === 'string' && child.props.fill !== 'none') {
      nodes.push({
        type: 'path',
        d: child.props.d,
        ...(toOptionalNumber(child.props.opacity) != null ? { opacity: toOptionalNumber(child.props.opacity) } : {}),
      });
    }
    return;
  }

  if (child.type === 'circle') {
    nodes.push({
      type: 'circle',
      cx: Number(child.props.cx),
      cy: Number(child.props.cy),
      r: Number(child.props.r),
      ...(toOptionalNumber(child.props.opacity) != null ? { opacity: toOptionalNumber(child.props.opacity) } : {}),
    });
    return;
  }

  if (child.type === 'ellipse') {
    nodes.push({
      type: 'ellipse',
      cx: Number(child.props.cx),
      cy: Number(child.props.cy),
      rx: Number(child.props.rx),
      ry: Number(child.props.ry),
      ...(toOptionalNumber(child.props.opacity) != null ? { opacity: toOptionalNumber(child.props.opacity) } : {}),
    });
    return;
  }

  throw new Error(`Unsupported SVG node type: ${String(child.type)}`);
}

function toOptionalNumber(value) {
  if (value == null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildCategoryModel(googleEntries) {
  const model = new Map();

  for (const category of CATEGORY_DEFINITIONS) {
    const tokenWeights = new Map();
    model.set(category.key, tokenWeights);

    for (const keyword of MANUAL_CATEGORY_KEYWORDS[category.key] ?? []) {
      tokenWeights.set(keyword, (tokenWeights.get(keyword) ?? 0) + 6);
    }
  }

  for (const entry of googleEntries) {
    const nameTokens = tokenize(entry.name);
    const tagTokens = tokenize((entry.tags ?? []).join(' '));

    for (const categoryKey of entry.groupKeys) {
      const tokenWeights = model.get(categoryKey);

      for (const token of nameTokens) {
        tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + 8);
      }

      for (const token of tagTokens) {
        tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + 2);
      }
    }
  }

  return model;
}

function classifyCategories(tokens, categoryModel) {
  const scores = CATEGORY_DEFINITIONS.map((category) => {
    const weights = categoryModel.get(category.key);
    let score = 0;

    for (const token of tokens) {
      score += weights.get(token) ?? 0;
    }

    return { key: category.key, score };
  }).sort((left, right) => right.score - left.score);

  const topScore = scores[0]?.score ?? 0;
  if (topScore <= 0) {
    return [FALLBACK_CATEGORY_KEY];
  }

  const result = scores
    .filter((entry) => entry.score >= Math.max(8, topScore * 0.6))
    .slice(0, 2)
    .map((entry) => entry.key);

  return result.length > 0 ? result : [scores[0].key];
}

function mapGoogleCategories(rawCategories) {
  const mappedCategories = new Set();

  for (const rawCategory of rawCategories ?? []) {
    const normalized = normalizeCategory(rawCategory);
    const mapped = RAW_GOOGLE_CATEGORY_MAP.get(normalized);
    if (mapped && CATEGORY_KEYS.has(mapped)) {
      mappedCategories.add(mapped);
    }
  }

  return [...mappedCategories];
}

function normalizeCategory(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function buildTokenSet(...values) {
  return new Set(values.flatMap((value) => tokenize(value)));
}

function buildSearchText(values) {
  return Array.from(buildTokenSet(...values)).sort().join(' ');
}

function tokenize(value) {
  return String(value ?? '')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

function buildDelimitedName(pascalName, separator) {
  return compactNumericTokens(
    splitPascalCase(pascalName)
      .map((token) => token.toLowerCase())
      .map((token) => NUMBER_WORDS.get(token) ?? token),
  ).join(separator);
}

function labelFromPascalCase(value) {
  return labelFromDelimitedName(buildDelimitedName(value, '-'));
}

function labelFromDelimitedName(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(formatLabelPart)
    .join(' ');
}

function formatLabelPart(part) {
  if (/^\d+[a-z]$/i.test(part)) {
    return `${part.slice(0, -1)}${part.slice(-1).toUpperCase()}`;
  }

  if (part.length === 1 || UPPERCASE_LABEL_PARTS.has(part.toLowerCase())) {
    return part.toUpperCase();
  }

  return part[0].toUpperCase() + part.slice(1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
