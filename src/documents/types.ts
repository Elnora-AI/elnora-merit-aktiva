// Types for the document-sync feature.
//
// "Document sync" keeps every accounting transaction backed by its source
// document (a supplier's invoice or receipt PDF). It audits Merit for
// transactions whose attachment is missing, searches configured sources for the
// matching file, attaches what it finds, and reports what it cannot find.
//
// Everything here is generic: no account, vendor, or organisation specifics.
// Real values come from config (see config.ts) and env, never from source.

/** A Merit transaction that is missing its source-document attachment. */
export interface MissingDoc {
	/** Merit document kind. Only these carry an attachable source document. */
	kind: "purchase-invoice" | "sales-invoice";
	/** Merit primary id (PIHId for purchases, SIHId for sales). */
	id: string;
	/** The supplier/customer bill number as entered in Merit. */
	billNo: string | null;
	/** Counterparty name (vendor for purchases, customer for sales). */
	partyName: string | null;
	/** Counterparty registry code, when Merit has it. */
	partyRegNo: string | null;
	/** Document date, ISO yyyy-mm-dd. */
	docDate: string | null;
	/** Gross total (with VAT), in the document currency. */
	grossTotal: number;
	/** ISO currency code. */
	currency: string;
	/** Whether Merit marks the transaction paid (a hint for matching bank dumps). */
	paid: boolean;
}

/** A candidate file discovered by a source that might be a missing document. */
export interface Candidate {
	/** Absolute path to a readable local file (sources materialise remote files locally). */
	path: string;
	/** File name as presented to the user (may differ from the basename of `path`). */
	fileName: string;
	/** MIME-ish hint; only application/pdf is attachable to Merit today. */
	contentType: string;
	/** Which source produced it (for the report), e.g. "dir:~/Downloads" or "command:gmail". */
	source: string;
	/** Optional extracted signals the source already parsed, to boost matching. */
	hints?: CandidateHints;
}

export interface CandidateHints {
	/** Amounts (any currency) the source parsed out of the file or its metadata. */
	amounts?: number[];
	/** Dates (ISO yyyy-mm-dd) the source parsed. */
	dates?: string[];
	/** Free text (filename, email subject, sender) to fuzzy-match the party name. */
	text?: string;
}

/** The outcome of matching one MissingDoc against the candidate pool. */
export interface MatchResult {
	missing: MissingDoc;
	/** Best candidate above the accept threshold, or null when nothing matched. */
	best: ScoredCandidate | null;
	/** Runners-up above the review threshold, for the report. */
	alternatives: ScoredCandidate[];
}

export interface ScoredCandidate {
	candidate: Candidate;
	/** 0..1 confidence. */
	score: number;
	/** Human-readable reasons the score was assigned (for the report / audit trail). */
	reasons: string[];
}

/** A source of candidate documents. Built-in `dir`, or a user `command`. */
export type SourceConfig =
	| { type: "dir"; path: string; recursive?: boolean }
	| { type: "command"; command: string; label?: string };

/** docsync config file shape (see config.ts). All fields optional with defaults. */
export interface DocsyncConfig {
	/** Where to look for candidate documents. Defaults to [~/Downloads] if unset. */
	sources: SourceConfig[];
	/** Score at/above which a candidate is auto-attached. Default 0.9. */
	acceptThreshold: number;
	/** Score at/above which a candidate is reported as a "review" suggestion. Default 0.6. */
	reviewThreshold: number;
	/** Amount tolerance (absolute, in currency units) for an "amount matches". Default 0.02. */
	amountTolerance: number;
	/** Max days between the document date and a candidate date to count as a date match. Default 5. */
	dateWindowDays: number;
	/**
	 * Incoming-webhook URL for the digest (Slack-compatible `{ text }` JSON POST).
	 * Read from config OR the MERIT_DOCSYNC_WEBHOOK env var. Never commit it.
	 */
	webhookUrl?: string;
	/** Optional shell command to run per-line for notification instead of a webhook. */
	notifyCommand?: string;
}
