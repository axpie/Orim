import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ICON_GROUP_KEYS,
  ICON_SOURCE_COUNTS,
  getIconDefinition,
  filterIconDefinitions,
  getEnabledIconGroupDefinitions,
  resolveEnabledIconGroupKeys,
} from '../iconCatalog';

describe('iconCatalog group filtering', () => {
  it('defaults to all icon groups when no board-specific selection exists', () => {
    expect(resolveEnabledIconGroupKeys(undefined)).toEqual(DEFAULT_ICON_GROUP_KEYS);
    expect(getEnabledIconGroupDefinitions(undefined).map((group) => group.key)).toEqual(DEFAULT_ICON_GROUP_KEYS);
  });

  it('falls back to the new full category set for legacy saved group keys', () => {
    expect(resolveEnabledIconGroupKeys(['infrastructure', 'software'])).toEqual(DEFAULT_ICON_GROUP_KEYS);
  });

  it('returns no icons when all icon groups are disabled', () => {
    expect(filterIconDefinitions('', { enabledGroupKeys: [] })).toEqual([]);
  });

  it('limits results to enabled groups', () => {
    const results = filterIconDefinitions('android', { enabledGroupKeys: ['android'] });
    expect(results.some((icon) => icon.name === 'material-android')).toBe(true);
    expect(results.every((icon) => icon.groupKeys.includes('android'))).toBe(true);

    const hiddenResults = filterIconDefinitions('android', { enabledGroupKeys: ['business'] });
    expect(hiddenResults.some((icon) => icon.name === 'material-android')).toBe(false);
  });

  it('supports browsing a specific enabled group', () => {
    const results = filterIconDefinitions('train', {
      enabledGroupKeys: ['transit', 'travel'],
      activeGroupKey: 'transit',
    });

    expect(results.some((icon) => icon.name === 'material-train')).toBe(true);
    expect(results.every((icon) => icon.groupKeys.includes('transit'))).toBe(true);
  });

  it('returns the full catalog for all-icons browsing and includes MDI brand icons', () => {
    const results = filterIconDefinitions('');

    expect(results).toHaveLength(ICON_SOURCE_COUNTS.material + ICON_SOURCE_COUNTS.mdi);
    expect(getIconDefinition('mdi-apple')).not.toBeNull();
    expect(results.some((icon) => icon.name === 'mdi-apple')).toBe(true);
    expect(filterIconDefinitions('apple').some((icon) => icon.name === 'mdi-apple')).toBe(true);
    expect(filterIconDefinitions('apple safari').some((icon) => icon.name === 'mdi-apple-safari')).toBe(true);
  });

  it('loads the full Google Material and MDI catalogs', () => {
    expect(ICON_SOURCE_COUNTS.material).toBeGreaterThan(2000);
    expect(ICON_SOURCE_COUNTS.mdi).toBeGreaterThan(7000);
    expect(DEFAULT_ICON_GROUP_KEYS).toHaveLength(17);
  });
});
