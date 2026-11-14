/** Part-name rules shared by the art import scripts. */

export const NS_INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';

/** View id for a top-level layer label. */
export function viewOf(label: string): string {
  if (/3-4|three|quarter/i.test(label)) return 'three-quarter';
  if (/side|profile/i.test(label)) return 'side';
  return 'front';
}

export const label = (el: Element) => el.getAttributeNS(NS_INKSCAPE, 'label') || el.getAttribute('inkscape:label') || '';
export const setLabel = (el: Element, v: string) => el.setAttribute('inkscape:label', v);
export const elements = (el: Element) => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
};

/** The figure side named by the nearest sided ancestor group (`arm_L`, `eye_R`, …). */
function sideFrom(groups: string[]): { side: string; group: string } | null {
  for (let i = groups.length - 1; i >= 0; i--) {
    const m = /^(.*)_([LR])(@\w+)?$/.exec(groups[i]!);
    if (m) return { side: m[2]!, group: m[1]! };
  }
  return null;
}

export function normalise(name: string, groups: string[], view: string): string {
  let n = name;
  const sided = sideFrom(groups);
  if (sided && !/_[LR](_|@|$)/.test(n)) {
    if (sided.group === 'arm' && n === 'hand') n = `arm_${sided.side}_hand`;
    else if (n.startsWith(`${sided.group}_`)) n = `${sided.group}_${sided.side}${n.slice(sided.group.length)}`;
  }
  if (view === 'side') {
    n = n
      .replace(/^(arm|leg)(_|$)/, '$1_L$2')
      .replace(/^(shirt|pants)_(arm|leg)_/, '$1_$2_L_')
      .replace(/^(eye|eyebrow|ear)(_|$)/, '$1_L$2')
      .replace(/^hand$/, 'arm_L_hand')
      .replace(/^pivot_(shoulder|elbow|wrist|hip|knee|ankle)$/, 'pivot_$1_L');
  }
  if (view === 'three-quarter') n = n.replace(/^ear$/, 'ear_L');
  return n;
}
