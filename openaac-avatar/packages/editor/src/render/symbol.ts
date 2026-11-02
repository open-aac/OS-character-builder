/** Rendering the current state through the shared core (same code as the CLI and server). */
import { renderSvg, type ResolvedPose } from '@openaac-avatar/core';
import { toRequest, type EditorState } from '../state/store';

export interface SymbolOptions {
  size: number;
  /** Keeps ids unique when several SVGs share the page. */
  idPrefix?: string;
  /** Embed the request so the file can be re-rendered later. */
  embedRequest?: boolean;
  /** Draw this exact pose instead of the state's (animation frames). */
  pose?: ResolvedPose;
}

export function renderSymbol(state: EditorState, { size, idPrefix = '', embedRequest = false, pose }: SymbolOptions): string {
  const req = toRequest(state);
  return renderSvg({ ...req, options: { ...req.options, size, idPrefix, embedRequest } }, undefined, pose);
}

export function fileName(state: EditorState, ext: 'svg' | 'png'): string {
  return `person-${state.view === 'front' ? '' : `${state.view}-`}${state.preset}-${Math.round(state.body * 100)}.${ext}`;
}
