/** Human-readable names for the core's ids. */
import type { ColorRole, Framing } from '@openaac-avatar/core';

/** Joint sliders, grouped by body part. R is the figure's right (the viewer's left). */
export const JOINT_GROUPS: readonly { title: string; joints: readonly string[] }[] = [
  { title: 'Head', joints: ['neck'] },
  { title: "Right arm (figure's right)", joints: ['shoulder_R', 'elbow_R', 'wrist_R'] },
  { title: "Left arm (figure's left)", joints: ['shoulder_L', 'elbow_L', 'wrist_L'] },
  { title: 'Right leg', joints: ['hip_R', 'knee_R', 'ankle_R'] },
  { title: 'Left leg', joints: ['hip_L', 'knee_L', 'ankle_L'] },
];

export const JOINT_NAMES: Readonly<Record<string, string>> = {
  neck: 'Tilt',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  hip: 'Hip',
  knee: 'Knee',
  ankle: 'Ankle',
};

export const COLOR_LABELS: Readonly<Record<ColorRole, string>> = {
  skin: 'Skin',
  hair: 'Hair',
  iris: 'Eyes',
  eyeWhite: 'Eye whites',
  top: 'Top',
  bottom: 'Bottom',
  ink: 'Outlines',
};

export const FRAMING_LABELS: Readonly<Record<Framing, string>> = {
  full: 'Full body',
  upper: 'Upper body',
  head: 'Head',
  canvas: 'Whole canvas',
};

export const VIEW_LABELS: Readonly<Record<string, string>> = {
  front: 'Front',
  'three-quarter': '¾ view',
  side: 'Side',
};

/** Names for the garment styles in the art; any other style gets a name made from its id. */
export const GARMENT_LABELS: Readonly<Record<'top' | 'bottom', Readonly<Record<string, string>>>> = {
  top: { tight_short: 'Fitted T-shirt', loose_short: 'Loose T-shirt', tight_long: 'Long sleeves', loose_long: 'Loose long sleeves' },
  bottom: { tight_short: 'Fitted shorts', loose_short: 'Loose shorts', tight_long: 'Trousers', loose_long: 'Loose trousers' },
};

/** Names for the hair styles in the art; any other style gets a name made from its id. */
export const HAIR_LABELS: Readonly<Record<string, string>> = {
  none: 'No hair',
  short_straight: 'Short, straight',
  short_textured: 'Short, curly',
  long_straight: 'Long, straight',
  long_textured: 'Long, curly',
};

export const EXPRESSION_LABELS: Readonly<Record<string, string>> = {
  content: 'Content',
  surprised: 'Surprised',
  unhappy: 'Unhappy',
  puzzled: 'Puzzled',
  angry: 'Angry',
};

/** `loose_long` → "Loose, long". */
export const styleLabel = (style: string) => {
  const t = style.replace(/_/g, ', ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
