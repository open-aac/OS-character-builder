import { getKit, kitExpressions, kitHairStyles } from '@openaac-avatar/core';
import { EXPRESSION_LABELS, HAIR_LABELS, styleLabel } from '../../config/labels';
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { choiceChips } from '../components';

/** Styles in the order the labels list them (the art's own order puts hair that hangs behind first); new ones last. */
const inLabelOrder = (names: string[], labels: Readonly<Record<string, string>>) => {
  const rank = (n: string) => (n in labels ? Object.keys(labels).indexOf(n) : 1e9);
  return [...names].sort((a, b) => rank(a) - rank(b));
};

/** Pick a hair style, or none. Choices come from the art, so new styles appear here by themselves. */
export function hairFields(store: Store): Node[] {
  const styles = inLabelOrder(kitHairStyles(getKit('front')), HAIR_LABELS);
  if (!styles.length) return [];
  return [
    h('p', { class: 'field-label' }, 'Hair'),
    choiceChips(
      'Hair',
      ['none', ...styles].map((style) => ({ value: style, label: HAIR_LABELS[style] ?? styleLabel(style) })),
      store.state.hair,
      (hair) => store.update({ hair }, { rebuild: true }),
    ),
  ];
}

/** Pick a facial expression. */
export function expressionFields(store: Store): Node[] {
  const names = inLabelOrder(kitExpressions(getKit('front')), EXPRESSION_LABELS);
  if (!names.length) return [];
  return [
    h('p', { class: 'field-label' }, 'Expression'),
    choiceChips(
      'Expression',
      names.map((name) => ({ value: name, label: EXPRESSION_LABELS[name] ?? styleLabel(name) })),
      store.state.expression,
      (expression) => store.update({ expression }, { rebuild: true }),
    ),
  ];
}
