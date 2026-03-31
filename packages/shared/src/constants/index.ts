// ── User ──
export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'restricted', 'suspended', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// ── Gig ──
export const GIG_STATUSES = ['draft', 'active', 'shelf', 'expired', 'archived', 'cancelled'] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const PRICE_TYPES = ['fixed', 'range', 'negotiable'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

// ── Application ──
export const APPLICATION_STATUSES = ['pending', 'accepted', 'rejected', 'closed', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// ── Contract ──
export const CONTRACT_STATUSES = [
  'draft',
  'in_progress',
  'pending_completion',
  'completed',
  'disputed',
  'arbitration',
  'auto_resolved',
  'cancelled',
  'quit',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const TERMINAL_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'completed',
  'auto_resolved',
  'cancelled',
  'quit',
] as const;

export const ACTIVE_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'draft',
  'in_progress',
  'pending_completion',
  'disputed',
  'arbitration',
] as const;

// ── Contract Appendix ──
export const APPENDIX_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
export type AppendixStatus = (typeof APPENDIX_STATUSES)[number];

export const MAX_APPENDICES_PER_CONTRACT = 3;

// ── Dispute / Arbiter ──
export const ARBITER_DECISIONS = ['favor_poster', 'favor_worker', 'dismiss'] as const;
export type ArbiterDecision = (typeof ARBITER_DECISIONS)[number];

// ── Billing ──
export const LEDGER_TYPES = ['poster_fee', 'worker_fee'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const LEDGER_STATUSES = ['pending', 'invoiced', 'paid'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const INVOICE_STATUSES = ['unpaid', 'paid'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ── Review ──
export const REVIEW_STATUSES = ['pending', 'published', 'flagged', 'removed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ── Visibility ──
export const VISIBILITY_LEVELS = ['public', 'authenticated', 'verified', 'on_request', 'post_contract', 'private'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

// ── OTP ──
export const OTP_CHANNELS = ['email', 'sms'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

// ── Notification ──
export const NOTIFICATION_TYPES = [
  'APPLICATION_RECEIVED',
  'APPLICATION_ACCEPTED',
  'CONTRACT_DRAFT_READY',
  'CONTRACT_SIGNED',
  'JOB_COMPLETE_PENDING',
  'CONTRACT_COMPLETED',
  'CONTRACT_DISPUTED',
  'APPENDIX_PROPOSED',
  'DISPUTE_REMINDER',
  'DISPUTE_AUTO_RESOLVED',
  'CONTRACT_OVERDUE_REMINDER',
  'CONTRACT_AUTO_COMPLETED',
  'ARBITER_DECISION',
  'INVOICE_GENERATED',
  'GIG_EXPIRED',
  'GIG_FLAGGED',
  'NEW_MESSAGE',
  'WORKER_QUIT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ── Info Request ──
export const INFO_REQUEST_STATUSES = ['pending', 'granted', 'denied'] as const;
export type InfoRequestStatus = (typeof INFO_REQUEST_STATUSES)[number];

// ── Flag ──
export const FLAG_STATUSES = ['pending', 'reviewed', 'dismissed'] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

// ── Fee Rates ──
export const POSTER_FEE_RATE = 0.03;
export const WORKER_FEE_RATE = 0.02;
export const CARRY_OVER_THRESHOLD = 1.0; // GEL

// ── Timing (milliseconds) ──
export const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
export const AUTO_COMPLETE_SILENCE_MS = 48 * 60 * 60 * 1000; // 48h after one party marks complete
export const DISPUTE_ARBITER_UNLOCK_MS = 24 * 60 * 60 * 1000; // 24h
export const DISPUTE_REMINDER_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
export const DISPUTE_AUTO_RESOLVE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const OVERDUE_REMINDER_1_MS = 24 * 60 * 60 * 1000; // +24h
export const OVERDUE_REMINDER_2_MS = 72 * 60 * 60 * 1000; // +72h
export const OVERDUE_REMINDER_3_MS = 7 * 24 * 60 * 60 * 1000; // +7d
export const OVERDUE_AUTO_COMPLETE_MS = 14 * 24 * 60 * 60 * 1000; // +14d
export const REVIEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const INVOICE_OVERDUE_BLOCK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Limits ──
export const MAX_CONTRACTS_PER_GIG = 100;
export const MAX_GIG_IMAGES = 10;
export const MAX_APPLICATION_ATTACHMENTS = 5;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DISPUTE_EVIDENCE_FILES = 10;
export const MAX_SHORT_BIO_LENGTH = 280;
export const MAX_SHORT_DESCRIPTION_LENGTH = 160;
export const MAX_GIG_EXPIRY_DAYS = 30;
export const ARBITER_FAULT_BLOCK_THRESHOLD = 2;
