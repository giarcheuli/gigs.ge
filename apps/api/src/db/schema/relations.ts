import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { userProfiles } from './profiles.js';
import { refreshTokens } from './auth.js';
import { regions, cities } from './regions.js';
import { gigs, gigImages } from './gigs.js';
import { applications, applicationAttachments } from './applications.js';
import { contracts, contractAppendices, disputeEvidence, disputeEvidenceFiles } from './contracts.js';
import { billingLedger, invoices } from './billing.js';
import { reviews } from './reviews.js';
import { notifications, messages } from './messages.js';
import { otpCodes, infoRequests, gigFlags } from './misc.js';

// ── Users ──
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  refreshTokens: many(refreshTokens),
  postedGigs: many(gigs),
  applications: many(applications),
  posterContracts: many(contracts, { relationName: 'posterContracts' }),
  workerContracts: many(contracts, { relationName: 'workerContracts' }),
  billingEntries: many(billingLedger),
  invoices: many(invoices),
  reviewsGiven: many(reviews, { relationName: 'reviewsGiven' }),
  reviewsReceived: many(reviews, { relationName: 'reviewsReceived' }),
  notifications: many(notifications),
  sentMessages: many(messages, { relationName: 'sentMessages' }),
  receivedMessages: many(messages, { relationName: 'receivedMessages' }),
  otpCodes: many(otpCodes),
}));

// ── User Profiles ──
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
  region: one(regions, { fields: [userProfiles.regionId], references: [regions.id] }),
  city: one(cities, { fields: [userProfiles.cityId], references: [cities.id] }),
}));

// ── Refresh Tokens ──
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

// ── Regions ──
export const regionsRelations = relations(regions, ({ many }) => ({
  cities: many(cities),
}));

// ── Cities ──
export const citiesRelations = relations(cities, ({ one }) => ({
  region: one(regions, { fields: [cities.regionId], references: [regions.id] }),
}));

// ── Gigs ──
export const gigsRelations = relations(gigs, ({ one, many }) => ({
  poster: one(users, { fields: [gigs.posterId], references: [users.id] }),
  region: one(regions, { fields: [gigs.regionId], references: [regions.id] }),
  city: one(cities, { fields: [gigs.cityId], references: [cities.id] }),
  images: many(gigImages),
  applications: many(applications),
  contracts: many(contracts),
  infoRequests: many(infoRequests),
  flags: many(gigFlags),
}));

// ── Gig Images ──
export const gigImagesRelations = relations(gigImages, ({ one }) => ({
  gig: one(gigs, { fields: [gigImages.gigId], references: [gigs.id] }),
}));

// ── Applications ──
export const applicationsRelations = relations(applications, ({ one, many }) => ({
  gig: one(gigs, { fields: [applications.gigId], references: [gigs.id] }),
  applicant: one(users, { fields: [applications.applicantId], references: [users.id] }),
  attachments: many(applicationAttachments),
  contract: one(contracts),
}));

// ── Application Attachments ──
export const applicationAttachmentsRelations = relations(applicationAttachments, ({ one }) => ({
  application: one(applications, { fields: [applicationAttachments.applicationId], references: [applications.id] }),
}));

// ── Contracts ──
export const contractsRelations = relations(contracts, ({ one, many }) => ({
  application: one(applications, { fields: [contracts.applicationId], references: [applications.id] }),
  gig: one(gigs, { fields: [contracts.gigId], references: [gigs.id] }),
  poster: one(users, { fields: [contracts.posterId], references: [users.id], relationName: 'posterContracts' }),
  worker: one(users, { fields: [contracts.workerId], references: [users.id], relationName: 'workerContracts' }),
  appendices: many(contractAppendices),
  evidence: many(disputeEvidence),
  billingEntries: many(billingLedger),
  reviews: many(reviews),
}));

// ── Contract Appendices ──
export const contractAppendicesRelations = relations(contractAppendices, ({ one }) => ({
  contract: one(contracts, { fields: [contractAppendices.contractId], references: [contracts.id] }),
  proposer: one(users, { fields: [contractAppendices.proposedBy], references: [users.id] }),
}));

// ── Dispute Evidence ──
export const disputeEvidenceRelations = relations(disputeEvidence, ({ one, many }) => ({
  contract: one(contracts, { fields: [disputeEvidence.contractId], references: [contracts.id] }),
  user: one(users, { fields: [disputeEvidence.userId], references: [users.id] }),
  files: many(disputeEvidenceFiles),
}));

// ── Dispute Evidence Files ──
export const disputeEvidenceFilesRelations = relations(disputeEvidenceFiles, ({ one }) => ({
  evidence: one(disputeEvidence, { fields: [disputeEvidenceFiles.evidenceId], references: [disputeEvidence.id] }),
}));

// ── Billing Ledger ──
export const billingLedgerRelations = relations(billingLedger, ({ one }) => ({
  user: one(users, { fields: [billingLedger.userId], references: [users.id] }),
  contract: one(contracts, { fields: [billingLedger.contractId], references: [contracts.id] }),
  invoice: one(invoices, { fields: [billingLedger.invoiceId], references: [invoices.id] }),
}));

// ── Invoices ──
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  markedPaidByUser: one(users, { fields: [invoices.markedPaidBy], references: [users.id] }),
  ledgerEntries: many(billingLedger),
}));

// ── Reviews ──
export const reviewsRelations = relations(reviews, ({ one }) => ({
  contract: one(contracts, { fields: [reviews.contractId], references: [contracts.id] }),
  reviewer: one(users, { fields: [reviews.reviewerId], references: [users.id], relationName: 'reviewsGiven' }),
  target: one(users, { fields: [reviews.targetId], references: [users.id], relationName: 'reviewsReceived' }),
}));

// ── Notifications ──
export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, { fields: [notifications.recipientId], references: [users.id] }),
}));

// ── Messages ──
export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id], relationName: 'sentMessages' }),
  recipient: one(users, { fields: [messages.recipientId], references: [users.id], relationName: 'receivedMessages' }),
}));

// ── OTP Codes ──
export const otpCodesRelations = relations(otpCodes, ({ one }) => ({
  user: one(users, { fields: [otpCodes.userId], references: [users.id] }),
}));

// ── Info Requests ──
export const infoRequestsRelations = relations(infoRequests, ({ one }) => ({
  gig: one(gigs, { fields: [infoRequests.gigId], references: [gigs.id] }),
  requester: one(users, { fields: [infoRequests.requesterId], references: [users.id] }),
}));

// ── Gig Flags ──
export const gigFlagsRelations = relations(gigFlags, ({ one }) => ({
  gig: one(gigs, { fields: [gigFlags.gigId], references: [gigs.id] }),
  reporter: one(users, { fields: [gigFlags.reporterId], references: [users.id] }),
  reviewedByUser: one(users, { fields: [gigFlags.reviewedBy], references: [users.id] }),
}));
