// Live Estonian Business Register (äriregister) XML web-service client.
//
// This talks to the SOAP endpoint at ariregxmlv6.rik.ee, distinct from the free
// bulk open-data CSV in src/reconcile/resolve/arireg.ts. It exposes only the two
// FREE services (Hind: tasuta) that add value at invoice time:
//
//   • ettevotjaRekvisiidid_v1 — live requisites (name, VAT, status, address) by
//     registrikood. Requires the contractual äriregister username/password.
//   • earveRegistriParing_v1  — whether a registrikood can receive e-invoices.
//     A no-contract service, so it is called without credentials.
//
// Every other arireg.* query is billed per call and is deliberately NOT wired here.
//
// Auth model (per RIK's XML v6 spec): credentials travel INSIDE the SOAP body as
// <ariregister_kasutajanimi>/<ariregister_parool>, not as HTTP auth. We never log
// them; the output layer additionally redacts secrets.

import { XMLParser } from "fast-xml-parser";
import { ApiError, AuthError, ValidationError } from "../utils/errors.js";
import { loadEnvFile } from "./auth.js";

const PROD_URL = "https://ariregxmlv6.rik.ee/";
const TEST_URL = "https://demo-ariregxmlv6.rik.ee/";

/** Resolve the SOAP endpoint. ARIREG_XML_URL wins; else ARIREG_XML_ENV=test|prod (default prod). */
export function resolveAriregXmlUrl(env: NodeJS.ProcessEnv = process.env): string {
	const explicit = env.ARIREG_XML_URL?.trim();
	if (explicit) return explicit;
	return env.ARIREG_XML_ENV?.trim().toLowerCase() === "test" ? TEST_URL : PROD_URL;
}

export interface AriregXmlCredentials {
	username: string;
	password: string;
}

/**
 * Resolve äriregister XML credentials from the environment (hydrated from the same
 * ~/.config/elnora-merit/.env used for Merit keys). Returns null when absent — the
 * caller decides whether the specific service requires them.
 */
export function resolveAriregXmlCredentials(env: NodeJS.ProcessEnv = process.env): AriregXmlCredentials | null {
	// Hydrate from the shared .env files only for the real environment; an explicit
	// env object (tests, callers managing their own) is used verbatim.
	if (env === process.env) loadEnvFile();
	const username = env.ARIREG_XML_USER?.trim();
	const password = env.ARIREG_XML_PASSWORD?.trim();
	if (!username || !password) return null;
	return { username, password };
}

const CREDENTIAL_SUGGESTION =
	"Set ARIREG_XML_USER and ARIREG_XML_PASSWORD in your environment or in ~/.config/elnora-merit/.env. " +
	"Create an XML-authorised user in the e-äriregister portal (Haldus → Kasutajate haldamine), " +
	"tick 'XML teenuste (API) kasutamine', and use that account's credentials.";

const SOAP_ENVELOPE_OPEN =
	'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
	'xmlns:prod="http://arireg.x-road.eu/producer/"><soapenv:Header/><soapenv:Body>';
const SOAP_ENVELOPE_CLOSE = "</soapenv:Body></soapenv:Envelope>";

function xmlEscape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const parser = new XMLParser({
	removeNSPrefix: true,
	ignoreAttributes: true,
	parseTagValue: false, // keep registrikood/EHAK as strings — leading zeros matter
	trimValues: true,
});

async function postSoap(body: string, url: string): Promise<Record<string, unknown>> {
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
			body: SOAP_ENVELOPE_OPEN + body + SOAP_ENVELOPE_CLOSE,
		});
	} catch (err) {
		throw new ApiError(0, `äriregister XML request failed: ${(err as Error).message}`, { url });
	}
	const text = await res.text();
	// RIK returns SOAP faults (including auth failures) with an HTTP 500 status, so
	// parse the body BEFORE reacting to the status — a legible faultstring beats a bare 500.
	let soapBody: Record<string, unknown> = {};
	try {
		const parsed = parser.parse(text) as Record<string, unknown>;
		const envelope = (parsed.Envelope ?? {}) as Record<string, unknown>;
		soapBody = (envelope.Body ?? {}) as Record<string, unknown>;
	} catch {
		// fall through to the HTTP-status error below
	}
	const fault = soapBody.Fault as { faultstring?: string; detail?: unknown } | undefined;
	if (fault) {
		const message = String(fault.faultstring ?? "unknown fault");
		// A credential rejection is an auth problem, not a generic upstream error.
		if (/user name or password|kasutajanimi|parool/i.test(message)) {
			throw new AuthError(`äriregister XML rejected the credentials: ${message}`, CREDENTIAL_SUGGESTION);
		}
		throw new ApiError(res.status, `äriregister XML fault: ${message}`, { fault });
	}
	if (!res.ok) {
		throw new ApiError(res.status, `äriregister XML returned HTTP ${res.status}`, { body: text.slice(0, 2000) });
	}
	return soapBody;
}

/** One item of coerce-to-array: RIK returns a bare object for one hit, an array for many. */
function asArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export interface AriregRequisites {
	regCode: string;
	name: string;
	vatNo: string | null;
	status: string;
	statusText: string;
	address: {
		street: string | null;
		ehakCode: string | null;
		ehakText: string | null;
		postalIndex: string | null;
	};
	registryLink: string | null;
}

export interface RequisitesOptions {
	/** Include deleted (kustutatud) companies in the search. Default false. */
	includeDeleted?: boolean;
	/** Response language for status text: "est" (default) or "eng". */
	language?: "est" | "eng";
	url?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Look up a single company's invoicing requisites by registry code via the FREE
 * ettevotjaRekvisiidid_v1 service. Requires äriregister XML credentials.
 * Returns null when the code matches no company.
 */
export async function lookupRequisites(
	regCode: string,
	opts: RequisitesOptions = {},
): Promise<AriregRequisites | null> {
	const code = regCode.trim();
	if (!/^\d{8}$/.test(code)) {
		throw new ValidationError(`Invalid registry code "${regCode}": expected 8 digits.`);
	}
	const env = opts.env ?? process.env;
	const creds = resolveAriregXmlCredentials(env);
	if (!creds) throw new AuthError("No äriregister XML credentials found.", CREDENTIAL_SUGGESTION);

	const body =
		"<prod:ettevotjaRekvisiidid_v1><prod:keha>" +
		`<prod:ariregister_kasutajanimi>${xmlEscape(creds.username)}</prod:ariregister_kasutajanimi>` +
		`<prod:ariregister_parool>${xmlEscape(creds.password)}</prod:ariregister_parool>` +
		`<prod:ariregistri_kood>${code}</prod:ariregistri_kood>` +
		`<prod:keel>${opts.language ?? "est"}</prod:keel>` +
		`<prod:naidata_kustutatuid>${opts.includeDeleted ? 1 : 0}</prod:naidata_kustutatuid>` +
		"</prod:keha></prod:ettevotjaRekvisiidid_v1>";

	const soapBody = await postSoap(body, opts.url ?? resolveAriregXmlUrl(env));
	const response = (soapBody.ettevotjaRekvisiidid_v1Response ?? {}) as Record<string, unknown>;
	const keha = (response.keha ?? {}) as Record<string, unknown>;
	const ettevotjad = (keha.ettevotjad ?? {}) as Record<string, unknown>;
	const items = asArray(ettevotjad.item as Record<string, unknown> | Record<string, unknown>[] | undefined);
	if (items.length === 0) return null;

	const item = items[0];
	const addr = (item.ettevotja_aadress ?? {}) as Record<string, unknown>;
	const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
	return {
		regCode: String(item.ariregistri_kood ?? code),
		name: String(item.nimi ?? ""),
		vatNo: str(item.kmkr_nr),
		status: String(item.ettevotja_staatus ?? ""),
		statusText: String(item.ettevotja_staatus_tekstina ?? ""),
		address: {
			street: str(addr.asukoht_ettevotja_aadressis),
			ehakCode: str(addr.asukoha_ehak_kood),
			ehakText: str(addr.asukoha_ehak_tekstina),
			postalIndex: str(addr.indeks_ettevotja_aadressis),
		},
		registryLink: str(item.teabesysteemi_link),
	};
}

export interface EInvoiceStatus {
	regCode: string;
	/** OK = has an active e-invoice relationship; MR = not found / invalid / no active relationship. */
	status: "OK" | "MR" | string;
	canReceiveEInvoice: boolean;
	name: string | null;
	provider: string | null;
}

export interface EInvoiceCheckOptions {
	url?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Check whether one or more registry codes can receive e-invoices via the FREE
 * earveRegistriParing_v1 service. This is a no-contract service, so it is called
 * without credentials. Always returns one row per requested code; a code with no
 * active relationship comes back with status "MR".
 */
export async function checkEInvoice(regCodes: string[], opts: EInvoiceCheckOptions = {}): Promise<EInvoiceStatus[]> {
	const codes = regCodes.map((c) => c.trim()).filter(Boolean);
	if (codes.length === 0) throw new ValidationError("checkEInvoice requires at least one registry code.");
	const bad = codes.find((c) => !/^\d{8}$/.test(c));
	if (bad) throw new ValidationError(`Invalid registry code "${bad}": expected 8 digits.`);

	const env = opts.env ?? process.env;
	const codesXml = codes.map((c) => `<prod:registrikood>${c}</prod:registrikood>`).join("");
	const body =
		"<prod:earveRegistriParing_v1><prod:keha>" +
		"<prod:tagasta_nimed>TRUE</prod:tagasta_nimed>" +
		"<prod:tulemuste_lk>1</prod:tulemuste_lk>" +
		`<prod:registrikoodid>${codesXml}</prod:registrikoodid>` +
		"</prod:keha></prod:earveRegistriParing_v1>";

	const soapBody = await postSoap(body, opts.url ?? resolveAriregXmlUrl(env));
	const response = (soapBody.earveRegistriParing_v1Response ?? {}) as Record<string, unknown>;
	const keha = (response.keha ?? {}) as Record<string, unknown>;
	const kliendid = (keha.kliendid ?? {}) as Record<string, unknown>;
	const rows = asArray(kliendid.klient as Record<string, unknown> | Record<string, unknown>[] | undefined);

	const byCode = new Map<string, Record<string, unknown>>();
	for (const row of rows) byCode.set(String(row.registrikood ?? ""), row);

	return codes.map((code) => {
		const row = byCode.get(code);
		const status = row ? String(row.staatus ?? "MR") : "MR";
		const name = row && typeof row.nimi === "string" ? row.nimi : null;
		const provider = row && typeof row.teenusepakkuja === "string" ? row.teenusepakkuja : null;
		return { regCode: code, status, canReceiveEInvoice: status === "OK", name, provider };
	});
}
