// "just now", "5 min ago", "3 h ago", "2 d ago": for launch times, shared by
// the server render and the browser.
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

// "1 min", "3 min", "8 min": how long a band's orbit takes, for labels.
export function every(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes <= 1 ? "minute" : `${minutes} minutes`;
}

// JSON for a <script type="application/json"> block: no "</script>" escapes.
export const embed = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
