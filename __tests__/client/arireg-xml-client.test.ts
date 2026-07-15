import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkEInvoice,
	lookupRequisites,
	resolveAriregXmlCredentials,
	resolveAriregXmlUrl,
} from "../../src/client/arireg-xml-client.js";
import { AuthError, ValidationError } from "../../src/utils/errors.js";

const CREDS = { ARIREG_XML_USER: "u", ARIREG_XML_PASSWORD: "p" } as NodeJS.ProcessEnv;

// Trimmed from RIK's published example responses (fictional field values are fine — we
// only assert the parser's shape handling).
const REQUISITES_XML = `<?xml version="1.0"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
 <SOAP-ENV:Body xmlns:ns1="http://arireg.x-road.eu/producer/">
  <ns1:ettevotjaRekvisiidid_v1Response><ns1:keha><ns1:ettevotjad><ns1:item>
    <ns1:nimi>Registrite ja Infosüsteemide Keskus</ns1:nimi>
    <ns1:ariregistri_kood>70000310</ns1:ariregistri_kood>
    <ns1:kmkr_nr>EE100523377</ns1:kmkr_nr>
    <ns1:ettevotja_staatus>R</ns1:ettevotja_staatus>
    <ns1:ettevotja_staatus_tekstina>Registrisse kantud</ns1:ettevotja_staatus_tekstina>
    <ns1:ettevotja_aadress>
      <ns1:asukoht_ettevotja_aadressis>Lõkke 4</ns1:asukoht_ettevotja_aadressis>
      <ns1:asukoha_ehak_kood>0784</ns1:asukoha_ehak_kood>
      <ns1:asukoha_ehak_tekstina>Tallinn</ns1:asukoha_ehak_tekstina>
      <ns1:indeks_ettevotja_aadressis>19081</ns1:indeks_ettevotja_aadressis>
    </ns1:ettevotja_aadress>
    <ns1:teabesysteemi_link>https://ariregister.rik.ee/x?ark=70000310</ns1:teabesysteemi_link>
  </ns1:item></ns1:ettevotjad><ns1:leitud_ettevotjate_arv>1</ns1:leitud_ettevotjate_arv></ns1:keha>
  </ns1:ettevotjaRekvisiidid_v1Response>
 </SOAP-ENV:Body></SOAP-ENV:Envelope>`;

const REQUISITES_EMPTY_XML = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
 <SOAP-ENV:Body xmlns:ns1="http://arireg.x-road.eu/producer/">
  <ns1:ettevotjaRekvisiidid_v1Response><ns1:keha><ns1:ettevotjad/>
    <ns1:leitud_ettevotjate_arv>0</ns1:leitud_ettevotjate_arv></ns1:keha>
  </ns1:ettevotjaRekvisiidid_v1Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

// One <klient> row => fast-xml-parser yields an object, not an array; exercises coercion.
const EINVOICE_XML = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
 <SOAP-ENV:Body xmlns:ns1="http://arireg.x-road.eu/producer/">
  <ns1:earveRegistriParing_v1Response><ns1:keha><ns1:lehekylgi>1</ns1:lehekylgi><ns1:kliendid>
    <ns1:klient><ns1:registrikood>70000310</ns1:registrikood><ns1:nimi>RIK</ns1:nimi>
      <ns1:teenusepakkuja>Fitek</ns1:teenusepakkuja><ns1:staatus>OK</ns1:staatus></ns1:klient>
  </ns1:kliendid></ns1:keha></ns1:earveRegistriParing_v1Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

const AUTH_FAULT_XML = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
 <SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Server</faultcode>
   <faultstring>Incorrect user name or password.</faultstring></SOAP-ENV:Fault>
 </SOAP-ENV:Body></SOAP-ENV:Envelope>`;

function stubFetch(body: string, status = 200): void {
	vi.stubGlobal("fetch", async () => new Response(body, { status }));
}

afterEach(() => vi.restoreAllMocks());

describe("resolveAriregXmlUrl", () => {
	it("defaults to production", () => {
		expect(resolveAriregXmlUrl({} as NodeJS.ProcessEnv)).toBe("https://ariregxmlv6.rik.ee/");
	});
	it("uses the demo endpoint when ARIREG_XML_ENV=test", () => {
		expect(resolveAriregXmlUrl({ ARIREG_XML_ENV: "test" } as NodeJS.ProcessEnv)).toBe(
			"https://demo-ariregxmlv6.rik.ee/",
		);
	});
	it("honours an explicit ARIREG_XML_URL", () => {
		expect(resolveAriregXmlUrl({ ARIREG_XML_URL: "https://x/" } as NodeJS.ProcessEnv)).toBe("https://x/");
	});
});

describe("resolveAriregXmlCredentials", () => {
	it("returns null when username or password is absent", () => {
		expect(resolveAriregXmlCredentials({} as NodeJS.ProcessEnv)).toBeNull();
		expect(resolveAriregXmlCredentials({ ARIREG_XML_USER: "u" } as NodeJS.ProcessEnv)).toBeNull();
	});
	it("returns trimmed credentials when both are present", () => {
		expect(
			resolveAriregXmlCredentials({ ARIREG_XML_USER: " u ", ARIREG_XML_PASSWORD: " p " } as NodeJS.ProcessEnv),
		).toEqual({
			username: "u",
			password: "p",
		});
	});
});

describe("lookupRequisites", () => {
	it("parses name, VAT, status, address and link", async () => {
		stubFetch(REQUISITES_XML);
		const r = await lookupRequisites("70000310", { env: CREDS });
		expect(r).toEqual({
			regCode: "70000310",
			name: "Registrite ja Infosüsteemide Keskus",
			vatNo: "EE100523377",
			status: "R",
			statusText: "Registrisse kantud",
			address: { street: "Lõkke 4", ehakCode: "0784", ehakText: "Tallinn", postalIndex: "19081" },
			registryLink: "https://ariregister.rik.ee/x?ark=70000310",
		});
	});
	it("returns null when no company matches", async () => {
		stubFetch(REQUISITES_EMPTY_XML);
		expect(await lookupRequisites("70000310", { env: CREDS })).toBeNull();
	});
	it("throws ValidationError for a non-8-digit code", async () => {
		await expect(lookupRequisites("123", { env: CREDS })).rejects.toBeInstanceOf(ValidationError);
	});
	it("throws AuthError when credentials are missing", async () => {
		await expect(lookupRequisites("70000310", { env: {} as NodeJS.ProcessEnv })).rejects.toBeInstanceOf(AuthError);
	});
	it("maps a credential-rejection SOAP fault (HTTP 500) to AuthError", async () => {
		stubFetch(AUTH_FAULT_XML, 500);
		await expect(lookupRequisites("70000310", { env: CREDS })).rejects.toBeInstanceOf(AuthError);
	});
});

describe("checkEInvoice", () => {
	it("parses a single client row and reports capability", async () => {
		stubFetch(EINVOICE_XML);
		const rows = await checkEInvoice(["70000310"], { env: CREDS });
		expect(rows).toEqual([
			{ regCode: "70000310", status: "OK", canReceiveEInvoice: true, name: "RIK", provider: "Fitek" },
		]);
	});
	it("returns MR for a requested code absent from the response", async () => {
		stubFetch(EINVOICE_XML);
		const rows = await checkEInvoice(["70000310", "10000001"], { env: CREDS });
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual({
			regCode: "10000001",
			status: "MR",
			canReceiveEInvoice: false,
			name: null,
			provider: null,
		});
	});
	it("throws ValidationError when no codes are given", async () => {
		await expect(checkEInvoice([])).rejects.toBeInstanceOf(ValidationError);
	});
	it("throws ValidationError for a malformed code", async () => {
		await expect(checkEInvoice(["70000310", "bad"])).rejects.toBeInstanceOf(ValidationError);
	});
});
