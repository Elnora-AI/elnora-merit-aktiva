// Free / consumer email providers. A charge from one of these domains cannot be tied
// to a company by its domain, so it is treated as a private individual (B2C) — which is
// the correct KMD treatment: private-individual sales are "isikustamata müük", not
// reportable on KMD INF, and belong in the anonymous summary. A free-mail buyer who is
// actually a company (bought "under a company name") is surfaced in the review list so it
// can be reclassified via an override.

const FREE_EMAIL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"outlook.com",
	"hotmail.com",
	"hotmail.co.uk",
	"live.com",
	"msn.com",
	"yahoo.com",
	"yahoo.co.uk",
	"ymail.com",
	"icloud.com",
	"me.com",
	"mac.com",
	"proton.me",
	"protonmail.com",
	"pm.me",
	"gmx.com",
	"gmx.net",
	"mail.com",
	"aol.com",
	"yandex.com",
	"yandex.ru",
	"mail.ru",
	"hot.ee", // common Estonian consumer webmail
	"online.ee",
	"zone.ee", // consumer mailboxes (also a host, but personal addresses dominate)
]);

export function isFreeEmailDomain(domain: string | null): boolean {
	return domain !== null && FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}
