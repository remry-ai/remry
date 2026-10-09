// Small text helpers for labels.

/**
 * Shortens `s` to at most `max` characters by cutting its middle, not its end:
 * names that share a prefix ("Platform Order …") usually differ at the end.
 */
export const truncateMiddle = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const tail = Math.floor((max - 1) * 0.4);
  return `${s.slice(0, max - 1 - tail).trimEnd()}…${s.slice(-tail).trimStart()}`;
};
