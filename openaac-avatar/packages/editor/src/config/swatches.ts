/** Quick-pick colours shown under each colour control. */
import type { ColorRole } from '@openaac-avatar/core';

export const SWATCHES: Readonly<Partial<Record<ColorRole, readonly string[]>>> = {
  skin: ['#f6d7c3', '#f1c27d', '#e0ac69', '#d59965', '#c68642', '#a0663a', '#8d5524', '#5c3a21', '#3b2414'],
  hair: ['#0f0a07', '#2b190d', '#5a3825', '#8b5a2b', '#b5651d', '#d4a017', '#e8d5a3', '#9e9e9e', '#f2f2f2'],
  eyebrow: ['#0f0a07', '#2b190d', '#5a3825', '#8b5a2b', '#b5651d', '#d4a017', '#e8d5a3', '#9e9e9e', '#f2f2f2'],
  iris: ['#482e11', '#1f1a14', '#3d6b99', '#4a7a46', '#7a6a4f'],
  top: ['#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#424242'],
  bottom: ['#acacac', '#1565c0', '#2e3b4e', '#5d4037', '#212121', '#6d4c41', '#c62828'],
};
