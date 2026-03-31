import type {
  UserRole,
  UserStatus,
  GigStatus,
  PriceType,
  ApplicationStatus,
  ContractStatus,
  AppendixStatus,
  LedgerType,
  LedgerStatus,
  InvoiceStatus,
  ReviewStatus,
  VisibilityLevel,
  OtpChannel,
  NotificationType,
  InfoRequestStatus,
  FlagStatus,
} from '../constants/index.js';

// ── User ──
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  role: UserRole;
  status: UserStatus;
  dateOfBirth: string; // ISO date
  lastAccessedAt: string | null;
  markedForDeletionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  country: string;
  regionId: number | null;
  cityId: number | null;
  streetAddress: string | null;
  whatsapp: string | null;
  telegram: string | null;
  signal: string | null;
  visFirstName: VisibilityLevel;
  visLastName: VisibilityLevel;
  visAvatar: VisibilityLevel;
  visRegion: VisibilityLevel;
  visWhatsapp: VisibilityLevel;
  visTelegram: VisibilityLevel;
  visSignal: VisibilityLevel;
  updatedAt: string;
}

// ── Gig ──
export interface Gig {
  id: string;
  posterId: string;
  shortDescription: string;
  longDescription: string | null;
  regionId: number;
  cityId: number | null;
  streetAddress: string | null;
  priceType: PriceType;
  priceFixed: string | null; // NUMERIC as string
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  status: GigStatus;
  visImages: VisibilityLevel;
  visPrice: VisibilityLevel;
  visCity: VisibilityLevel;
  visAddress: VisibilityLevel;
  visContact: VisibilityLevel;
  visDates: VisibilityLevel;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Application ──
export interface Application {
  id: string;
  gigId: string;
  applicantId: string;
  status: ApplicationStatus;
  message: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Contract ──
export interface Contract {
  id: string;
  applicationId: string;
  gigId: string;
  posterId: string;
  workerId: string;
  agreedPrice: string | null;
  agreedStartAt: string;
  dueAt: string | null;
  status: ContractStatus;
  posterSignedAt: string | null;
  workerSignedAt: string | null;
  feeEligible: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Contract Appendix ──
export interface ContractAppendix {
  id: string;
  contractId: string;
  proposedBy: string;
  description: string;
  additionalCompensation: string | null;
  newDueAt: string | null;
  newStartAt: string | null;
  status: AppendixStatus;
  appendixNumber: number;
  createdAt: string;
  resolvedAt: string | null;
}

// ── Billing ──
export interface BillingLedgerEntry {
  id: string;
  userId: string;
  contractId: string;
  amount: string;
  type: LedgerType;
  status: LedgerStatus;
  carryOver: boolean;
  invoiceId: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  billingPeriod: string;
  totalAmount: string;
  status: InvoiceStatus;
  pdfUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  markedPaidBy: string | null;
}

// ── Review ──
export interface Review {
  id: string;
  contractId: string;
  reviewerId: string;
  targetId: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  publishedAt: string | null;
}

// ── Notification ──
export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

// ── Message ──
export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// ── Geography ──
export interface Region {
  id: number;
  nameEn: string;
  nameKa: string;
  code: string;
}

export interface City {
  id: number;
  regionId: number;
  nameEn: string;
  nameKa: string;
}

// ── API Responses ──
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  statusCode: number;
  details?: unknown;
}
