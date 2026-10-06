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

// "40 min", "23 h", "12 days": how long until something happens, roughly.
export function until(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

// "6 hours to 2 days", "3 to 18 days", "4 weeks to 3 months": the spread of
// how long an orbit lasts, in round numbers.
export function lasting(shortest: number, longest: number): string {
  const unit = (ms: number): [number, string] => {
    const days = ms / 86_400_000;
    if (days < 1.5) return [Math.round(days * 24), "hours"];
    if (days < 21) return [Math.round(days), "days"];
    if (days < 50) return [Math.round(days / 7), "weeks"];
    return [Math.round(days / 30), "months"];
  };
  const [a, aUnit] = unit(shortest);
  const [b, bUnit] = unit(longest);
  return aUnit === bUnit ? `${a} to ${b} ${bUnit}` : `${a} ${aUnit} to ${b} ${bUnit}`;
}

// "612.41 km", and "↓ 13 km/h" or "↓ 0.6 km/h": a height and how fast it's
// falling, for the catalogue. Two decimals, so a low orbit is seen to fall
// every few seconds.
export const km = (value: number) =>
  `${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
export const falling = (kmPerHour: number) =>
  `↓ ${kmPerHour < 10 ? kmPerHour.toFixed(1) : Math.round(kmPerHour).toLocaleString("en")} km/h`;

// JSON for a <script type="application/json"> block: no "</script>" escapes.
export const embed = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
