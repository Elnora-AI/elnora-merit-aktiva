// Output helpers + secret redaction.

/**
 * Redact Merit/Stripe credentials and request signatures from a string. Defensive —
 * used in error envelopes that may echo back fragments of request URLs, bodies, or
 * upstream responses. Scrubs:
 *   - MERIT_API_KEY / MERIT_API_ID / STRIPE_API_KEY env assignments
 *   - apiId / apiKey / signature query-string parameters
 *   - apiId / apiKey / api_key / signature in JSON/object bodies
 *   - `Authorization: Bearer <token>` headers (Stripe keys)
 */
export function redactSecrets(text: string): string {
	return text
		.replace(
			/((?:MERIT_API_KEY|MERIT_API_ID|MERIT_PALK_API_KEY|MERIT_PALK_API_ID|STRIPE_API_KEY)\s*=\s*)\S+/gi,
			"$1[REDACTED]",
		)
		.replace(/([?&](?:signature|apiKey|apiId)=)[^&\s"']+/gi, "$1[REDACTED]")
		.replace(/("(?:api_?key|api_?id|signature)"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
		.replace(/(Authorization\s*:\s*Bearer\s+)\S+/gi, "$1[REDACTED]");
}
