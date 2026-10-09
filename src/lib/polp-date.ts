export function formatPolpDate(value: string): string {
  // Keep the provider's calendar date, also used by reconciliation. Converting
  // through the browser timezone can move midnight entries to the previous day.
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : "Data não informada";
}
