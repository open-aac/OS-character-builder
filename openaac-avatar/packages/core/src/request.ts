/**
 * Checks and fills in defaults for a render request coming from outside
 * (HTTP body, saved JSON file, editor state). Everything that ends up in
 * the SVG passes through here, so colours and ids are safe to write out.
 */
import { PRESET_BY_ID, DEFAULT_PRESET } from './presets.js';
import { JOINT_BY_ID } from './rig.js';
import type { AvatarInput, ColorRole, Framing, GarmentSlot, PoseInput, RenderOptions, RenderRequest } from './types.js';

export const DEFAULT_COLORS: Readonly<Record<ColorRole, string>> = {
  skin: '#d59965',
  hair: '#2b190d',
  iris: '#482e11',
  eyeWhite: '#ffffff',
  top: '#ffffff',
  bottom: '#acacac',
  ink: '#000000',
};

export const COLOR_ROLES = Object.keys(DEFAULT_COLORS) as ColorRole[];

export const GARMENT_SLOTS: readonly GarmentSlot[] = ['top', 'bottom'];

export const FRAMINGS: readonly Framing[] = ['full', 'upper', 'head', 'canvas'];

export interface NormalizedRequest {
  view: string;
  pose: Required<PoseInput> & { adjust: Record<string, number> };
  avatar: {
    body: number;
    colors: Record<ColorRole, string>;
    lineWeight: number;
    clothing: Partial<Record<GarmentSlot, string>>;
    /** Hair style id, `none`, or null for the art's default. */
    hair: string | null;
    /** Expression id, or null for the art's default. */
    expression: string | null;
  };
  options: Required<Omit<RenderOptions, 'title' | 'background'>> & { title: string | null; background: string | null };
}

export class RequestError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join('; '));
    this.name = 'RequestError';
  }
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeColor(v: string): string {
  const s = v.toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate a request. Throws RequestError listing every problem at once. */
export function normalizeRequest(input: unknown): NormalizedRequest {
  const problems: string[] = [];
  const req: RenderRequest = isObj(input) ? (input as RenderRequest) : {};
  if (!isObj(input) && input !== undefined) problems.push('request must be a JSON object');

  const num = (v: unknown, name: string, lo: number, hi: number, dflt: number): number => {
    if (v === undefined || v === null) return dflt;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${name} must be a number`);
      return dflt;
    }
    if (v < lo || v > hi) problems.push(`${name} must be between ${lo} and ${hi}`);
    return Math.min(hi, Math.max(lo, v));
  };

  // Pose
  const pose: PoseInput = isObj(req.pose) ? req.pose : {};
  if (req.pose !== undefined && !isObj(req.pose)) problems.push('pose must be an object');
  const preset = pose.preset ?? DEFAULT_PRESET;
  if (typeof preset !== 'string' || !PRESET_BY_ID.has(preset)) {
    problems.push(`pose.preset must be one of: ${[...PRESET_BY_ID.keys()].join(', ')}`);
  }
  const adjust: Record<string, number> = {};
  if (pose.adjust !== undefined) {
    if (!isObj(pose.adjust)) problems.push('pose.adjust must be an object of joint: degrees');
    else {
      for (const [joint, v] of Object.entries(pose.adjust)) {
        if (!JOINT_BY_ID.has(joint)) problems.push(`pose.adjust: unknown joint "${joint}"`);
        else adjust[joint] = num(v, `pose.adjust.${joint}`, -180, 180, 0);
      }
    }
  }

  // Avatar
  const avatar: AvatarInput = isObj(req.avatar) ? req.avatar : {};
  if (req.avatar !== undefined && !isObj(req.avatar)) problems.push('avatar must be an object');
  const colors: Record<ColorRole, string> = { ...DEFAULT_COLORS };
  if (avatar.colors !== undefined) {
    if (!isObj(avatar.colors)) problems.push('avatar.colors must be an object of role: "#rrggbb"');
    else {
      for (const [role, v] of Object.entries(avatar.colors)) {
        if (!(role in DEFAULT_COLORS)) problems.push(`avatar.colors: unknown role "${role}" (use ${COLOR_ROLES.join(', ')})`);
        else if (typeof v !== 'string' || !HEX.test(v)) problems.push(`avatar.colors.${role} must be a hex colour like #a1b2c3`);
        else colors[role as ColorRole] = normalizeColor(v);
      }
    }
  }

  // Clothing: checked against the art's styles when rendering.
  const clothing: Partial<Record<GarmentSlot, string>> = {};
  if (avatar.clothing !== undefined) {
    if (!isObj(avatar.clothing)) problems.push('avatar.clothing must be an object like { "top": "tight_short", "bottom": "tight_long" }');
    else {
      for (const [slot, v] of Object.entries(avatar.clothing)) {
        if (!GARMENT_SLOTS.includes(slot as GarmentSlot)) problems.push(`avatar.clothing: unknown slot "${slot}" (use ${GARMENT_SLOTS.join(', ')})`);
        else if (v === undefined || v === null) continue;
        else if (typeof v !== 'string' || !/^[a-z]+_[a-z]+$/.test(v)) problems.push(`avatar.clothing.${slot} must be a style id like "tight_short"`);
        else clothing[slot as GarmentSlot] = v;
      }
    }
  }

  // Hair and expression: checked against the art's offerings when rendering.
  const choice = (v: unknown, name: string, example: string): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' || !/^[a-z]+(?:_[a-z]+)?$/.test(v)) {
      problems.push(`avatar.${name} must be an id like "${example}"`);
      return null;
    }
    return v;
  };
  const hair = choice(avatar.hair, 'hair', 'short_straight');
  const expression = choice(avatar.expression, 'expression', 'content');

  // Options
  const o: RenderOptions = isObj(req.options) ? req.options : {};
  if (req.options !== undefined && !isObj(req.options)) problems.push('options must be an object');
  const framing = o.framing ?? 'full';
  if (!FRAMINGS.includes(framing)) problems.push(`options.framing must be one of: ${FRAMINGS.join(', ')}`);
  let background: string | null = null;
  if (o.background !== undefined && o.background !== null) {
    if (typeof o.background !== 'string' || !HEX.test(o.background)) problems.push('options.background must be a hex colour or null');
    else background = normalizeColor(o.background);
  }
  const idPrefix = o.idPrefix ?? '';
  if (typeof idPrefix !== 'string' || !/^(?:[A-Za-z][\w-]{0,31})?$/.test(idPrefix)) {
    problems.push('options.idPrefix must start with a letter and use only letters, digits, _ or - (max 32)');
  }
  let title: string | null = null;
  if (o.title !== undefined) {
    if (typeof o.title !== 'string' || o.title.length > 200) problems.push('options.title must be a string of up to 200 characters');
    else title = o.title;
  }
  if (o.embedRequest !== undefined && typeof o.embedRequest !== 'boolean') problems.push('options.embedRequest must be true or false');

  const view = req.view ?? 'front';
  if (typeof view !== 'string' || !/^[a-z][a-z-]{0,31}$/.test(view)) problems.push('view must be a view name like "front", "three-quarter" or "side"');

  const result: NormalizedRequest = {
    view,
    pose: { preset, adjust },
    avatar: {
      body: num(avatar.body, 'avatar.body', 0, 1, 0.5),
      colors,
      lineWeight: num(avatar.lineWeight, 'avatar.lineWeight', 0.25, 4, 1),
      clothing,
      hair,
      expression,
    },
    options: {
      framing,
      size: num(o.size, 'options.size', 16, 4096, 1000),
      padding: num(o.padding, 'options.padding', 0, 0.5, 0.04),
      background,
      idPrefix,
      embedRequest: o.embedRequest ?? true,
      title,
    },
  };
  if (problems.length) throw new RequestError(problems);
  return result;
}
