const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * X-style post timestamp: "now", "5m", "3h" within the last day, then
 * "Jul 22" for this year and "Jan 15, 2024" for older posts.
 */
export function formatPostDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;

  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;

  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${monthDay}, ${date.getFullYear()}`;
}
