/**
 * Shared types for the art kit, poses, avatar settings and render options.
 *
 * Coordinates are in art-kit units: the source canvas is 1000 x 1000, with
 * y pointing down (standard SVG).
 */

export type Point = readonly [number, number];

/**
 * One continuous outline, stored as absolute cubic Bézier data:
 * [x0, y0, c1x, c1y, c2x, c2y, x1, y1, c1x, c1y, ...].
 * Every segment is a cubic, so two shapes with the same segment count can be
 * blended point for point.
 */
export interface Subpath {
  closed: boolean;
  pts: number[];
}

/** Colour roles a fill can be recoloured through. `fixed` keeps the source colour. */
export const FILL_ROLES = ['skin', 'hair', 'eyebrow', 'iris', 'eyeWhite', 'top', 'bottom', 'ink', 'fixed'] as const;
export type FillRole = (typeof FILL_ROLES)[number];

/** Recolourable roles exposed to users (`fixed` is not recolourable). */
export type ColorRole = Exclude<FillRole, 'fixed'>;

/** Line weight classes: body outlines (10 at 1000px) and facial features (5). */
export type StrokeRole = 'body' | 'face';

export interface KitPart {
  id: string;
  fillRole: FillRole | null;
  /** Source fill colour, used when the role is `fixed`. */
  fill: string | null;
  strokeRole: StrokeRole | null;
  /** One shape per extreme, both with the same subpath and segment layout. */
  shapes: Record<Extreme, Subpath[]>;
}

export type Extreme = 'low' | 'high';

export interface ArtKit {
  format: 'openaac-avatar-kit';
  version: 1;
  view: string;
  canvas: { width: number; height: number };
  /** Stroke width in kit units for each stroke role at line weight 1. */
  strokeWidths: Record<StrokeRole, number>;
  /** Parts in source drawing order (back to front). */
  parts: KitPart[];
  /** Joint pivots, keyed by pivot name without the `pivot_` prefix, e.g. `shoulder_R`. */
  pivots: Record<string, Record<Extreme, Point>>;
  source: { files: Record<Extreme, string>; compiledAt: string };
}

/* ------------------------------------------------------------------ */
/* Poses                                                                */
/* ------------------------------------------------------------------ */

/** Joint angles in degrees, relative to the rest pose in the art. */
export type JointAngles = Partial<Record<string, number>>;

/** Length scale along a limb's own axis (1 = as drawn). Used to fake foreshortening, e.g. thighs when sitting. */
export type SegmentScales = Partial<Record<string, number>>;

export interface PoseInput {
  /** Template pose id. Defaults to `standing`. */
  preset?: string;
  /** Offsets added to the template's angles, clamped to the template's adjustment range. */
  adjust?: JointAngles;
  /**
   * Hand style per side, replacing what the template draws: `open`, `grip`, `relaxed`, `rest`,
   * `point` or `wave` (which ones exist depends on the view). `R` is the figure's right (the
   * viewer's left). Omitted: the template's own hands.
   */
  hands?: HandChoice;
}

/** A hand style for each side of the figure. */
export type HandChoice = Partial<Record<'L' | 'R', string>>;

export interface AvatarInput {
  /** Body size from 0 (slim extreme) to 1 (broad extreme). */
  body?: number;
  colors?: Partial<Record<ColorRole, string>>;
  /** Multiplier for all line weights. 1 = style guide weights. */
  lineWeight?: number;
  /**
   * Which garment to wear in each slot, by style id from the art (e.g. `tight_short`,
   * `loose_short`, `tight_long`). Omitted: the first style the art has. Views whose art
   * has only one outfit ignore this.
   */
  clothing?: Partial<Record<GarmentSlot, string>>;
  /**
   * Hair style id from the art (e.g. `short_straight`, `long_textured`), or `none`. Omitted: the
   * default style. Views are drawn with the same style.
   */
  hair?: string;
  /** Facial expression id from the art (e.g. `content`, `surprised`). Omitted: `content`. */
  expression?: string;
}

/** Where a garment is worn. */
export type GarmentSlot = 'top' | 'bottom';

export type Framing = 'full' | 'upper' | 'head' | 'canvas';

export interface RenderOptions {
  /** What part of the figure to show. Default `full`. */
  framing?: Framing;
  /** Output width and height in px. Default 1000. */
  size?: number;
  /** Space around the cropped figure, as a fraction of the crop size. Default 0.04. */
  padding?: number;
  /** Optional solid background colour. Default transparent. */
  background?: string | null;
  /** Prefix for element ids, so several symbols can share one page. Default ''. */
  idPrefix?: string;
  /** Embed the request (pose + avatar) in <metadata> so the file can be regenerated later. Default true. */
  embedRequest?: boolean;
  /** Optional <title> text for accessibility. */
  title?: string;
}

/** A full render request: what the CLI batch files and the HTTP endpoint accept. */
export interface RenderRequest {
  /** Which art to use: `front` (default), `three-quarter` or `side`. */
  view?: string;
  pose?: PoseInput;
  avatar?: AvatarInput;
  options?: RenderOptions;
}
