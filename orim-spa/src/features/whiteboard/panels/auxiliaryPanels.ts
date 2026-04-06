export type AuxiliaryPanelKind = 'properties' | 'assistant';

export const AUXILIARY_PANEL_WIDTHS: Record<AuxiliaryPanelKind, number> = {
  properties: 360,
  assistant: 420,
};

export function getAuxiliaryPanelWidth(panel: AuxiliaryPanelKind | null): number {
  if (!panel) {
    return 0;
  }

  return AUXILIARY_PANEL_WIDTHS[panel];
}

export function toggleAuxiliaryPanel(
  currentPanel: AuxiliaryPanelKind | null,
  nextPanel: AuxiliaryPanelKind,
): AuxiliaryPanelKind | null {
  return currentPanel === nextPanel ? null : nextPanel;
}
