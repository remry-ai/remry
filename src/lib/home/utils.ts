/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", then a date. */
export const timeAgo = (at: Date | string, now: Date = new Date()): string => {
  const date = typeof at === 'string' ? new Date(at) : at;
  const secs = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-CA');
};
