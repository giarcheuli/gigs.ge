import { z } from 'zod';
import {
  USER_ROLES,
  USER_STATUSES,
  GIG_STATUSES,
  PRICE_TYPES,
  APPLICATION_STATUSES,
  CONTRACT_STATUSES,
  APPENDIX_STATUSES,
  VISIBILITY_LEVELS,
  OTP_CHANNELS,
  REVIEW_STATUSES,
  LEDGER_TYPES,
  LEDGER_STATUSES,
  INVOICE_STATUSES,
  INFO_REQUEST_STATUSES,
  FLAG_STATUSES,
  MAX_SHORT_DESCRIPTION_LENGTH,
  MAX_SHORT_BIO_LENGTH,
  MAX_FILE_SIZE_BYTES,
  MAX_APPLICATION_ATTACHMENTS,
  MAX_GIG_IMAGES,
  MAX_DISPUTE_EVIDENCE_FILES,
  MAX_APPENDICES_PER_CONTRACT,
} from '../constants/index.js';

// ── Helpers ──
const uuid = z.string().uuid();
const isoDatetime = z.string().datetime();

// ── Auth ──
export const registerSchema = z.object({
  email: z.string().email().max(255),
  phone: z.string().regex(/^\+\d{7,15}$/, 'Must be E.164 format'),
  password: z.string().min(8).max(128),
  dateOfBirth: z.string().date(), // YYYY-MM-DD
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const verifyOtpSchema = z.object({
  code: z.string().min(4).max(8),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

// ── Profile ──
export const updateProfileSchema = z.object({
  firstName: z.string().max(100).nullish(),
  lastName: z.string().max(100).nullish(),
  shortBio: z.string().max(MAX_SHORT_BIO_LENGTH).nullish(),
  regionId: z.number().int().positive().nullish(),
  cityId: z.number().int().positive().nullish(),
  streetAddress: z.string().max(500).nullish(),
  whatsapp: z.string().max(50).nullish(),
  telegram: z.string().max(50).nullish(),
  signal: z.string().max(50).nullish(),
  visFirstName: z.enum(VISIBILITY_LEVELS).optional(),
  visLastName: z.enum(VISIBILITY_LEVELS).optional(),
  visAvatar: z.enum(VISIBILITY_LEVELS).optional(),
  visRegion: z.enum(VISIBILITY_LEVELS).optional(),
  visWhatsapp: z.enum(VISIBILITY_LEVELS).optional(),
  visTelegram: z.enum(VISIBILITY_LEVELS).optional(),
  visSignal: z.enum(VISIBILITY_LEVELS).optional(),
});

// ── Gig ──
export const createGigSchema = z.object({
  shortDescription: z.string().min(1).max(MAX_SHORT_DESCRIPTION_LENGTH),
  longDescription: z.string().max(5000).nullish(),
  regionId: z.number().int().positive(),
  cityId: z.number().int().positive().nullish(),
  streetAddress: z.string().max(500).nullish(),
  priceType: z.enum(PRICE_TYPES),
  priceFixed: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  priceRangeMin: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  priceRangeMax: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  availableFrom: isoDatetime.nullish(),
  availableTo: isoDatetime.nullish(),
  visImages: z.enum(VISIBILITY_LEVELS).optional(),
  visPrice: z.enum(VISIBILITY_LEVELS).optional(),
  visCity: z.enum(VISIBILITY_LEVELS).optional(),
  visAddress: z.enum(VISIBILITY_LEVELS).optional(),
  visContact: z.enum(VISIBILITY_LEVELS).optional(),
  visDates: z.enum(VISIBILITY_LEVELS).optional(),
});

export const updateGigSchema = createGigSchema.partial();

// ── Application ──
export const createApplicationSchema = z.object({
  message: z.string().max(2000).nullish(),
});

export const updateApplicationSchema = z.object({
  status: z.enum(['accepted', 'rejected'] as const),
  rejectionReason: z.string().max(1000).nullish(),
});

// ── Contract ──
export const createContractSchema = z.object({
  applicationId: uuid,
});

export const updateContractDraftSchema = z.object({
  agreedPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  agreedStartAt: isoDatetime.optional(),
  dueAt: isoDatetime.nullish(),
  shortDescription: z.string().min(1).max(MAX_SHORT_DESCRIPTION_LENGTH).optional(),
  longDescription: z.string().max(5000).nullish(),
});

export const rejectContractDraftSchema = z.object({
  reason: z.string().max(1000).nullish(),
});

// ── Contract Appendix ──
export const createAppendixSchema = z.object({
  description: z.string().min(1).max(5000),
  additionalCompensation: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  newDueAt: isoDatetime.nullish(),
  newStartAt: isoDatetime.nullish(),
});

export const resolveAppendixSchema = z.object({
  status: z.enum(['accepted', 'rejected'] as const),
});

// ── Evidence ──
export const submitEvidenceSchema = z.object({
  description: z.string().min(1).max(5000),
});

// ── Review ──
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullish(),
});

// ── Message ──
export const sendMessageSchema = z.object({
  recipientId: uuid,
  body: z.string().min(1).max(5000),
});

// ── Info Request ──
export const createInfoRequestSchema = z.object({
  field: z.string().min(1).max(50),
});

export const resolveInfoRequestSchema = z.object({
  status: z.enum(['granted', 'denied'] as const),
});

// ── Flag ──
export const createFlagSchema = z.object({
  reason: z.string().min(1).max(2000),
});

// ── Admin ──
export const adminUpdateUserSchema = z.object({
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(USER_ROLES).optional(),
});

export const adminResolveDisputeSchema = z.object({
  decision: z.enum(['favor_poster', 'favor_worker', 'dismiss'] as const),
  notes: z.string().max(5000).nullish(),
});

export const adminMarkInvoicePaidSchema = z.object({
  paidAt: isoDatetime.optional(),
});

// ── Pagination ──
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Type exports from schemas ──
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateGigInput = z.infer<typeof createGigSchema>;
export type UpdateGigInput = z.infer<typeof updateGigSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractDraftInput = z.infer<typeof updateContractDraftSchema>;
export type CreateAppendixInput = z.infer<typeof createAppendixSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
