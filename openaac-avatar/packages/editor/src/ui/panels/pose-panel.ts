import { JOINT_BY_ID, VIEWS, getKit, kitHandStyles, presetsForView } from '@openaac-avatar/core';
import { HAND_LABELS, JOINT_GROUPS, VIEW_LABELS } from '../../config/labels';
import { h } from '../../lib/dom';
import { limbPresets, matchingPreset } from '../../render/limb-presets';
import { jointsInView } from '../../render/pose';
import { renderSymbol } from '../../render/symbol';
import type { Store } from '../../state/store';
import { choiceChips, hint, panel, subPanel } from '../components';
import { ICONS } from '../icons';
import { adjustFields } from './adjust-panel';

export function poseIconSvg(store: Store, preset: string): string {
  return renderSymbol({ ...store.state, preset, adjust: {}, hands: {}, framing: 'full', background: null }, { size: 44, idPrefix: `pose-${preset}` });
}

/** A tiny version of the figure in that pose, in the current colours and body size (kept up to date by the preview). */
function poseIcon(store: Store, preset: string): HTMLElement {
  const icon = h('span', { class: 'pose-icon', 'aria-hidden': 'true', 'data-preset': preset });
  icon.innerHTML = poseIconSvg(store, preset);
  return icon;
}

/** A tiny preview of the figure with a limb preset's angles applied, on top of the current pose. */
function presetIcon(store: Store, idPrefix: string, angles: Record<string, number>): HTMLElement {
  const icon = h('span', { class: 'pose-icon', 'aria-hidden': 'true' });
  icon.innerHTML = renderSymbol({ ...store.state, adjust: { ...store.state.adjust, ...angles } }, { size: 44, idPrefix });
  return icon;
}

/** The limb groups with at least one joint the current view's art can move. */
function availableGroups(view: string): (typeof JOINT_GROUPS)[number][] {
  const inView = jointsInView(view);
  return JOINT_GROUPS.filter((g) => g.joints.some((id) => inView(JOINT_BY_ID.get(id)?.pivot ?? '')));
}

function firstAvailableGroup(view: string): string {
  return (availableGroups(view)[0] ?? JOINT_GROUPS[0])!.title;
}

/** Shown only on the selected template: jumps into the limb view for it, without navigating there automatically. */
function editPoseLink(store: Store): HTMLElement {
  const icon = h('span', { 'aria-hidden': 'true' });
  icon.innerHTML = ICONS.edit;
  const link = h('button', { type: 'button', class: 'pose-edit-link' }, icon, 'Edit pose');
  link.addEventListener('click', (e) => {
    e.stopPropagation();
    store.setPoseView({ limb: firstAvailableGroup(store.state.view) });
  });
  return link;
}

/** The template gallery: pick a view, then a template pose. The selected template shows an "Edit pose" link into the limb view. */
function galleryView(store: Store): Node[] {
  const { view } = store.state;
  const presets = presetsForView(view);
  return [
    h('p', { class: 'field-label' }, 'View'),
    choiceChips(
      'View',
      VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] ?? v })),
      view,
      (next) => {
        // Keep the pose if the new view has it, otherwise stand.
        const keep = presetsForView(next).some((p) => p.id === store.state.preset);
        store.update({ view: next, preset: keep ? store.state.preset : 'standing', adjust: {}, hands: {} }, { rebuild: true });
      },
    ),
    h('p', { class: 'field-label' }, 'Template'),
    choiceChips(
      'Template pose',
      presets.map((p) => ({ value: p.id, label: p.label, title: p.description, icon: poseIcon(store, p.id) })),
      store.state.preset,
      (preset) => store.update({ preset, adjust: {}, hands: {} }, { rebuild: true }),
      'pose-grid',
      () => editPoseLink(store),
    ),
    ...(presets.length < 9 ? [hint('More poses for this view once its hand art arrives.')] : []),
  ];
}

/** The "limb" that stands for both hands: chosen from the Limb chips like an arm or leg. */
const HANDS = 'Hands';

/** Hand styles the current view's art offers (more than just the open hand), or none. */
function handStyles(view: string): string[] {
  const styles = kitHandStyles(getKit(view));
  return styles.length < 2 ? [] : styles;
}

/** Hand styles for the figure's right and left hands. */
function handsView(store: Store, styles: string[]): Node[] {
  const side = (name: 'Right' | 'Left', key: 'R' | 'L') => [
    h('p', { class: 'field-label' }, `${name} hand`),
    choiceChips(
      `${name} hand style`,
      [{ value: '', label: 'Pose default' }, ...styles.map((style) => ({ value: style, label: HAND_LABELS[style] ?? style }))],
      store.state.hands[key] ?? '',
      (style) => {
        const next = { ...store.state.hands };
        if (style) next[key] = style;
        else delete next[key];
        store.update({ hands: next }, { rebuild: true });
      },
    ),
  ];

  return [...side('Right', 'R'), ...side('Left', 'L')];
}

/** The limb view: pick a limb, then a quick preset position for it; exact control stays in Fine adjustments below. */
function limbView(store: Store, limb: string): Node[] {
  const groups = availableGroups(store.state.view);
  const styles = handStyles(store.state.view);
  const onHands = limb === HANDS && styles.length > 0;
  const current = groups.find((g) => g.title === limb) ?? groups[0];
  const titles = groups.map((g) => g.title);
  if (styles.length) titles.splice(titles.indexOf('Head') + 1, 0, HANDS);
  const limbChips = titles.map((title) => ({ value: title, label: title }));

  const backIcon = h('span', { 'aria-hidden': 'true' });
  backIcon.innerHTML = ICONS.back;
  const back = h('button', { type: 'button', class: 'btn btn-ghost pose-back' }, backIcon, 'Back to poses');
  back.addEventListener('click', () => store.setPoseView(null));

  const limbPicker = [
    h('p', { class: 'field-label' }, 'Limb'),
    choiceChips('Limb', limbChips, onHands ? HANDS : (current?.title ?? ''), (title) => store.setPoseView({ limb: title })),
  ];

  if (onHands) return [back, ...limbPicker, ...handsView(store, styles)];
  if (!current) return [back, hint('No adjustable limbs in this view.')];

  const presets = limbPresets(store.state, current);
  // idPrefix must be short and plain (letters/digits/_/-, max 32 chars): the group's first joint id is unique and stable, unlike its title.
  const groupIdPrefix = current.joints[0] ?? 'limb';
  const presetBody = presets.length
    ? choiceChips(
        'Preset position',
        presets.map((p) => ({ value: p.id, label: p.label, icon: presetIcon(store, `preset-${groupIdPrefix}-${p.id}`, p.angles) })),
        matchingPreset(store.state.adjust, presets),
        (id) => {
          const preset = presets.find((p) => p.id === id)!;
          store.update({ adjust: { ...store.state.adjust, ...preset.angles } }, { rebuild: true });
        },
        'pose-grid',
      )
    : hint('Fixed in this pose: the art is drawn already in position.');

  return [
    back,
    ...limbPicker,
    h('p', { class: 'field-label' }, 'Preset position'),
    presetBody,
    subPanel('Fine adjustments', 'adjust', ...adjustFields(store)),
  ];
}

export function posePanel(store: Store): HTMLElement {
  const body = store.poseView ? limbView(store, store.poseView.limb) : galleryView(store);
  return panel('Pose', 'pose', ...body);
}
