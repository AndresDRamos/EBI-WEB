/** Moves `fromId` to sit where `toId` currently is (splice-out, splice-in) —
 * the house pattern for local drag reorder of a flat id list, shared by the
 * nav access tree and the operative-cells child-order editor. */
export function reorder<T>(arr: T[], fromId: T, toId: T): T[] {
  const from = arr.indexOf(fromId);
  const to = arr.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}
