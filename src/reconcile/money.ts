// Money helpers. The pipeline carries integer minor units; Merit payloads take
// decimals. EUR (and every currency we target) is 2-decimal; if a 0- or 3-decimal
// currency is ever needed this is the single place to generalize.

/** Convert integer minor units to a 2-decimal number for a Merit payload. */
export function minorToDecimal(minor: number): number {
	return Math.round(minor) / 100;
}

/** Format minor units as a human string like "449.00" for previews/logs. */
export function formatMinor(minor: number): string {
	return (Math.round(minor) / 100).toFixed(2);
}
