// Merit Aktiva request signing.
//
// Every Merit API call is authenticated with three query-string parameters:
//   apiId, timestamp, signature
//
// The signature is an HMAC-SHA256 over the concatenation of the API ID, the
// timestamp, and the EXACT request body string that is sent, keyed by the raw
// bytes of the API key. The result is base64-encoded (and must be URL-encoded
// when placed in the query string).
//
//   dataToSign  := utf8_bytes( apiId + timestamp + httpBody )
//   hmacKey     := ascii_bytes( apiKey )            // the key string verbatim,
//                                                   // NOT base64-decoded
//   signature   := base64( hmac_sha256(hmacKey, dataToSign) )
//
// Verified against Merit's published test vector (see __tests__/client/signer.test.ts):
//   apiId     670fe52f-558a-4be8-ade0-526e01a106d0
//   apiKey    AoCmZGUfWMMhLJ+Eb6oRF4pAEw9XJP9b/RL5c2Gqk2w=
//   timestamp 20240624205902
//   body      {"CustName":"Kliendinimi","CustId":"3a274294-9c60-4a3d-93f0-1874253f073e","OverDueDays":5,"DebtDate":"20220501"}
//   signature dt6dkfuj+OfX01YkvvAoN/fekAUGr6AvVlQhUUja9Qc=
//
// The body MUST be the same byte-for-byte string that goes on the wire — so the
// client signs the already-serialized body, never a re-serialization of it.

import { createHmac } from "node:crypto";

/**
 * Format a Date as Merit's required UTC timestamp: `yyyyMMddHHmmss`.
 * Merit rejects timestamps that are too old or in the future, so callers must
 * pass the current time (and re-generate it on every retry).
 */
export function formatTimestamp(date: Date): string {
	const y = date.getUTCFullYear().toString().padStart(4, "0");
	const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const d = date.getUTCDate().toString().padStart(2, "0");
	const h = date.getUTCHours().toString().padStart(2, "0");
	const mi = date.getUTCMinutes().toString().padStart(2, "0");
	const s = date.getUTCSeconds().toString().padStart(2, "0");
	return `${y}${mo}${d}${h}${mi}${s}`;
}

/**
 * Compute the base64 HMAC-SHA256 signature for a Merit API request.
 *
 * @param apiId     API ID (GUID) from Merit API settings.
 * @param timestamp UTC timestamp string in `yyyyMMddHHmmss` (see formatTimestamp).
 * @param body      The exact request body string sent on the wire ("" for no body).
 * @param apiKey    API key (base64-looking secret) used verbatim as the HMAC key.
 * @returns         Base64-encoded signature. URL-encode before placing in a query string.
 */
export function sign(apiId: string, timestamp: string, body: string, apiKey: string): string {
	const dataToSign = `${apiId}${timestamp}${body}`;
	return createHmac("sha256", Buffer.from(apiKey, "utf8")).update(dataToSign, "utf8").digest("base64");
}
