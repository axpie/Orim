export type GeneratedIconCategoryKey =
  | 'actions'
  | 'activities'
  | 'android'
  | 'audio-video'
  | 'business'
  | 'communicate'
  | 'hardware'
  | 'home'
  | 'household'
  | 'images'
  | 'maps'
  | 'privacy'
  | 'social'
  | 'text'
  | 'transit'
  | 'travel'
  | 'ui-actions';

export type GeneratedIconNode =
  | {
    type: 'path';
    d: string;
    opacity?: number;
  }
  | {
    type: 'circle';
    cx: number;
    cy: number;
    r: number;
    opacity?: number;
  }
  | {
    type: 'ellipse';
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    opacity?: number;
  };

export interface GeneratedIconDefinition {
  name: string;
  label: string;
  rank: number;
  searchText: string;
  groupKeys: GeneratedIconCategoryKey[];
  nodes: GeneratedIconNode[];
}

export interface GeneratedIconSourceCounts {
  material: number;
  mdi: number;
}
