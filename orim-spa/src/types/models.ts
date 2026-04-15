// ============================================================================
// TypeScript types mirroring C# models from Orim.Core
// ============================================================================

// --- Enums ---

export enum BoardVisibility {
  Private = 'Private',
  Public = 'Public',
  Shared = 'Shared',
}

export enum BoardRole {
  Owner = 'Owner',
  Editor = 'Editor',
  Viewer = 'Viewer',
}

export enum UserRole {
  User = 'User',
  Admin = 'Admin',
}

export enum ShapeType {
  Rectangle = 'Rectangle',
  Ellipse = 'Ellipse',
  Triangle = 'Triangle',
  Rhombus = 'Rhombus',
  Terminator = 'Terminator',
  Parallelogram = 'Parallelogram',
  Hexagon = 'Hexagon',
  Cylinder = 'Cylinder',
  Cross = 'Cross',
}

export enum BorderLineStyle {
  Solid = 'Solid',
  Dashed = 'Dashed',
  Dotted = 'Dotted',
  DashDot = 'DashDot',
  LongDash = 'LongDash',
  Double = 'Double',
}

export enum ArrowLineStyle {
  Solid = 'Solid',
  Dashed = 'Dashed',
  Dotted = 'Dotted',
  DashDot = 'DashDot',
  LongDash = 'LongDash',
}

export enum ArrowHeadStyle {
  None = 'None',
  FilledTriangle = 'FilledTriangle',
  OpenTriangle = 'OpenTriangle',
  FilledCircle = 'FilledCircle',
  OpenCircle = 'OpenCircle',
}

export enum ArrowRouteStyle {
  Straight = 'Straight',
  Orthogonal = 'Orthogonal',
  Arc = 'Arc',
}

export enum DockPoint {
  Top = 'Top',
  Bottom = 'Bottom',
  Left = 'Left',
  Right = 'Right',
  Center = 'Center',
}

export enum HorizontalLabelAlignment {
  Left = 'Left',
  Center = 'Center',
  Right = 'Right',
}

export enum VerticalLabelAlignment {
  Top = 'Top',
  Middle = 'Middle',
  Bottom = 'Bottom',
}

// --- Board Element Hierarchy (discriminated union) ---

export interface BoardElementBase {
  id: string;
  groupId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  isLocked?: boolean;
  label: string;
  labelFontSize?: number | null;
  labelColor?: string | null;
  fontFamily?: string | null;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  labelHorizontalAlignment: HorizontalLabelAlignment;
  labelVerticalAlignment: VerticalLabelAlignment;
}

export interface ShapeElement extends BoardElementBase {
  $type: 'shape';
  shapeType: ShapeType;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  borderLineStyle: BorderLineStyle;
}

export interface TextStyleElementBase extends BoardElementBase {
  fontSize: number;
  autoFontSize?: boolean;
  color: string;
}

export interface TextElement extends TextStyleElementBase {
  $type: 'text';
  text: string;
}

export interface RichTextElement extends TextStyleElementBase {
  $type: 'richtext';
  html: string;
  scrollLeft?: number;
  scrollTop?: number;
}

export interface MarkdownElement extends TextStyleElementBase {
  $type: 'markdown';
  markdown: string;
  scrollLeft?: number;
  scrollTop?: number;
}

export interface StickyNoteElement extends BoardElementBase {
  $type: 'sticky';
  text: string;
  fontSize: number;
  autoFontSize?: boolean;
  fillColor: string;
  color: string;
}

export interface FrameElement extends BoardElementBase {
  $type: 'frame';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export interface ArrowElement extends BoardElementBase {
  $type: 'arrow';
  sourceElementId?: string | null;
  targetElementId?: string | null;
  sourceX?: number | null;
  sourceY?: number | null;
  targetX?: number | null;
  targetY?: number | null;
  sourceDock: DockPoint;
  targetDock: DockPoint;
  strokeColor: string;
  strokeWidth: number;
  lineStyle: ArrowLineStyle;
  sourceHeadStyle: ArrowHeadStyle;
  targetHeadStyle: ArrowHeadStyle;
  routeStyle: ArrowRouteStyle;
  orthogonalMiddleCoordinate?: number | null;
  arcMidX?: number | null;
  arcMidY?: number | null;
}

export interface IconElement extends BoardElementBase {
  $type: 'icon';
  iconName: string;
  color: string;
}

export enum ImageFit {
  Uniform = 'Uniform',
  UniformToFill = 'UniformToFill',
  Fill = 'Fill',
}

export interface FileElement extends BoardElementBase {
  $type: 'file';
  fileUrl: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  /** Only relevant for image/* content types */
  opacity?: number | null;
  /** Only relevant for image/* content types */
  imageFit?: ImageFit | null;
}

export interface DrawingElement extends BoardElementBase {
  $type: 'drawing';
  points: number[];
  strokeColor: string;
  strokeWidth: number;
}

export type TextContentElement = TextElement | RichTextElement | MarkdownElement;

export type BoardElement = ShapeElement | TextContentElement | StickyNoteElement | FrameElement | ArrowElement | IconElement | FileElement | DrawingElement;

export type StylePresetType = 'shape' | 'text' | 'sticky' | 'frame' | 'icon' | 'arrow' | 'drawing';
export type StylePresetMode = 'theme-default' | 'last-used' | 'preset';

export type ShapeStylePreset = Pick<
  ShapeElement,
  | 'fillColor'
  | 'strokeColor'
  | 'strokeWidth'
  | 'borderLineStyle'
  | 'labelFontSize'
  | 'labelColor'
  | 'fontFamily'
  | 'isBold'
  | 'isItalic'
  | 'isUnderline'
  | 'isStrikethrough'
  | 'labelHorizontalAlignment'
  | 'labelVerticalAlignment'
>;

export type TextStylePreset = Pick<
  TextStyleElementBase,
  | 'fontSize'
  | 'autoFontSize'
  | 'fontFamily'
  | 'color'
  | 'isBold'
  | 'isItalic'
  | 'isUnderline'
  | 'isStrikethrough'
  | 'labelHorizontalAlignment'
  | 'labelVerticalAlignment'
>;

export type StickyStylePreset = Pick<
  StickyNoteElement,
  | 'fontSize'
  | 'autoFontSize'
  | 'fontFamily'
  | 'fillColor'
  | 'color'
  | 'isBold'
  | 'isItalic'
  | 'isUnderline'
  | 'isStrikethrough'
  | 'labelHorizontalAlignment'
  | 'labelVerticalAlignment'
>;

export type FrameStylePreset = Pick<
  FrameElement,
  | 'fillColor'
  | 'strokeColor'
  | 'strokeWidth'
  | 'labelFontSize'
  | 'labelColor'
  | 'fontFamily'
  | 'isBold'
  | 'isItalic'
  | 'isUnderline'
  | 'isStrikethrough'
  | 'labelHorizontalAlignment'
  | 'labelVerticalAlignment'
>;

export type IconStylePreset = Pick<IconElement, 'color'>;
export type ArrowStylePreset = Pick<ArrowElement, 'strokeColor' | 'strokeWidth' | 'labelFontSize' | 'labelColor' | 'fontFamily'>;
export type DrawingStylePreset = Pick<DrawingElement, 'strokeColor' | 'strokeWidth'>;

export interface StylePresetStyleByType {
  shape: ShapeStylePreset;
  text: TextStylePreset;
  sticky: StickyStylePreset;
  frame: FrameStylePreset;
  icon: IconStylePreset;
  arrow: ArrowStylePreset;
  drawing: DrawingStylePreset;
}

export type StylePresetStyle = StylePresetStyleByType[StylePresetType];

export interface NamedStylePreset<T extends StylePresetType = StylePresetType> {
  id: string;
  type: T;
  name: string;
  style: StylePresetStyleByType[T];
  createdAt: string;
  updatedAt: string;
}

export interface StylePresetPlacementPreference {
  mode: StylePresetMode;
  presetId: string | null;
}

export interface BoardStylePresetState {
  presets: NamedStylePreset[];
  placementPreferences: Record<StylePresetType, StylePresetPlacementPreference>;
  lastUsedStyles: Partial<Record<StylePresetType, StylePresetStyle>>;
}

// --- Board ---

export interface BoardMember {
  userId: string;
  username: string;
  role: BoardRole;
}

export interface BoardSnapshot {
  id: string;
  name: string;
  createdByUserId: string;
  createdByUsername: string;
  createdAt: string;
  contentJson: string;
}

export interface BoardCommentReply {
  id: string;
  authorUserId: string;
  authorUsername: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardComment {
  id: string;
  boardId: string;
  authorUserId: string;
  authorUsername: string;
  x: number;
  y: number;
  text: string;
  replies: BoardCommentReply[];
  createdAt: string;
  updatedAt: string;
}

export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type BoardSyncStatusKind =
  | 'connecting'
  | 'saving'
  | 'saved'
  | 'unsaved'
  | 'unsyncedChanges'
  | 'reconnecting'
  | 'offline'
  | 'saveError'
  | 'connectionError';

export interface BoardSyncStatus {
  kind: BoardSyncStatusKind;
  hasPendingChanges: boolean;
  queuedChangesCount?: number;
  detail?: string | null;
}

export interface StickyNotePreset {
  id: string;
  label: string;
  fillColor: string;
}

export interface BoardFolder {
  id: string;
  name: string;
  ownerId: string;
  parentFolderId: string | null;
  createdAt: string;
}

export type GridStyle = 'lines' | 'dots' | 'none';

export interface Board {
  id: string;
  title: string;
  labelOutlineEnabled: boolean;
  arrowOutlineEnabled: boolean;
  gridStyle?: GridStyle | null;
  surfaceColor?: string | null;
  themeKey?: string | null;
  enabledIconGroups?: string[];
  customColors: string[];
  recentColors: string[];
  stickyNotePresets: StickyNotePreset[];
  stylePresetState?: BoardStylePresetState;
  ownerId: string;
  folderId?: string | null;
  tags?: string[];
  visibility: BoardVisibility;
  shareLinkToken?: string | null;
  sharedAllowAnonymousEditing: boolean;
  sharePasswordHash?: string | null;
  members: BoardMember[];
  elements: BoardElement[];
  comments: BoardComment[];
  snapshots: BoardSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  folderId?: string | null;
  tags?: string[];
  visibility: BoardVisibility;
  shareLinkToken?: string | null;
  members: BoardMember[];
  elementCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- User ---

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
}

export interface UpdateProfileRequest {
  displayName: string;
}

export interface UpdateUserRequest {
  username: string;
  role: UserRole;
}

// --- Template ---

export interface BoardTemplateDefinition {
  id: string;
  iconName: string;
  titleResourceKey: string;
  descriptionResourceKey: string;
}

export interface CreateBoardRequest {
  title: string;
  templateId?: string;
  themeKey?: string;
  visibility?: BoardVisibility;
}

export interface ImportBoardRequest {
  boardJson: string;
  title?: string;
}

export interface ThemePaletteDefinition {
  primary: string;
  secondary: string;
  tertiary: string;
  appbarBackground: string;
  appbarText: string;
  background: string;
  surface: string;
  drawerBackground: string;
  drawerText: string;
  drawerIcon: string;
  textPrimary: string;
  textSecondary: string;
  linesDefault: string;
  success?: string;
  warning?: string;
  info?: string;
}

export interface ThemeBoardDefaultsDefinition {
  surfaceColor: string;
  gridColor: string;
  shapeFillColor: string;
  strokeColor: string;
  iconColor: string;
  selectionColor: string;
  selectionTintRgb: string;
  handleSurfaceColor: string;
  dockTargetColor: string;
  themeColors: string[];
}

export interface ThemeDefinition {
  key: string;
  name: string;
  isDarkMode: boolean;
  isEnabled: boolean;
  isProtected?: boolean;
  fontFamily: string[];
  cssVariables?: Record<string, string>;
  palette: ThemePaletteDefinition;
  boardDefaults: ThemeBoardDefaultsDefinition;
}

// --- Auth ---

export interface LoginResponse {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface MicrosoftAuthProvider {
  clientId: string;
  authority: string;
  scopes: string[];
}

export interface GoogleAuthProvider {
  clientId: string;
}

export interface AuthProvidersResponse {
  microsoft: MicrosoftAuthProvider | null;
  google: GoogleAuthProvider | null;
}

// --- Assistant ---

export interface ChatMessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface DiagramAssistantEvent {
  type: 'Message' | 'ElementAdded' | 'ElementUpdated' | 'ElementRemoved' | 'BoardCleared' | 'Error';
  content: string;
}

export interface AssistantResponse {
  events: DiagramAssistantEvent[];
  board: Board;
}

export interface AssistantAdminSettings {
  enabled: boolean;
  endpoint: string;
  deploymentName: string;
  hasApiKey: boolean;
  isConfigured: boolean;
  provider: string;
}

export interface AssistantAvailability {
  isEnabled: boolean;
  isConfigured: boolean;
}

export interface AssistantSettingsUpdateRequest {
  enabled: boolean;
  endpoint: string;
  deploymentName: string;
  apiKey?: string;
}

export interface DeploymentReadiness {
  environmentName: string;
  applicationVersion: string;
  databaseProvider: string;
  isRelationalDatabase: boolean;
  databaseConnected: boolean;
  pendingMigrationCount: number;
  httpsRedirectionEnabled: boolean;
  hstsEnabled: boolean;
  requestIdHeaderEnabled: boolean;
  rateLimitingEnabled: boolean;
  cookieAuthEnabled: boolean;
  microsoftSsoConfigured: boolean;
  googleSsoConfigured: boolean;
  assistantEnabled: boolean;
  assistantConfigured: boolean;
  enabledThemeCount: number;
  totalThemeCount: number;
  healthEndpoints: string[];
}

// --- Cursor Presence ---

export interface CursorPresence {
  clientId: string;
  userId?: string | null;
  displayName: string;
  colorHex: string;
  worldX?: number | null;
  worldY?: number | null;
  selectedElementIds?: string[];
  updatedAtUtc: string;
  isPresenting?: boolean;
  viewportCameraX?: number | null;
  viewportCameraY?: number | null;
  viewportZoom?: number | null;
}

export interface FollowMeSessionStartedNotification {
  clientId: string;
  displayName: string;
}

export interface BringToViewportNotification {
  clientId: string;
  displayName: string;
  cameraX: number;
  cameraY: number;
  zoom: number;
}

// --- Board Change Notification ---

export interface BoardChangeNotification {
  boardId: string;
  sourceClientId?: string | null;
  changedAtUtc: string;
  kind: 'Content' | 'Presentation' | 'Metadata';
}

export interface BoardStateUpdateNotification {
  boardId: string;
  sourceClientId?: string | null;
  changedAtUtc: string;
  kind: string;
  board: Board;
}

export interface BoardElementAddedOperation {
  type: 'element.added';
  element: BoardElement;
}

export interface BoardElementUpdatedOperation {
  type: 'element.updated';
  element: BoardElement;
}

export interface BoardElementDeletedOperation {
  type: 'element.deleted';
  elementId: string;
}

export interface BoardElementsDeletedOperation {
  type: 'elements.deleted';
  elementIds: string[];
}

export interface BoardMetadataUpdatedOperation {
  type: 'board.metadata.updated';
  title?: string;
  labelOutlineEnabled?: boolean;
  arrowOutlineEnabled?: boolean;
  gridStyle?: GridStyle | null;
  surfaceColor?: string | null;
  themeKey?: string | null;
  enabledIconGroups?: string[];
  customColors?: string[];
  recentColors?: string[];
  stickyNotePresets?: StickyNotePreset[];
  stylePresetState?: BoardStylePresetState;
}

export type BoardOperation =
  | BoardElementAddedOperation
  | BoardElementUpdatedOperation
  | BoardElementDeletedOperation
  | BoardElementsDeletedOperation
  | BoardMetadataUpdatedOperation;

export interface BoardOperationNotification {
  boardId: string;
  sourceClientId?: string | null;
  changedAtUtc: string;
  sequenceNumber: number;
  operation: BoardOperation;
}

export interface BoardOperationHistoryEntry {
  sequenceNumber: number;
  changedAtUtc: string;
  clientId?: string | null;
  userId?: string | null;
  operation: BoardOperation;
}

export interface BoardOperationHistoryResponse {
  latestSequenceNumber: number;
  hasMore: boolean;
  operations: BoardOperationHistoryEntry[];
}

// --- Board Files ---
export interface BoardFileInfo {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}
