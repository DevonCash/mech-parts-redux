/**
 * Transient UI state — which dock panel is open. Not part of saves.
 */
import { atom } from 'nanostores'

export type DockPanel = 'contracts' | 'market' | 'forces' | null

export const openPanel = atom<DockPanel>(null)

export function togglePanel(panel: Exclude<DockPanel, null>): void {
  openPanel.set(openPanel.get() === panel ? null : panel)
}
