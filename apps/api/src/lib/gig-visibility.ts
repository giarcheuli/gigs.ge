import { and, eq, inArray, or } from 'drizzle-orm';
import { ACTIVE_CONTRACT_STATUSES } from '@gigs/shared/constants';
import { verifyAccessToken } from './auth.js';
import type { AccessTokenPayload } from './auth.js';
import { db } from '../db/index.js';
import { contracts } from '../db/schema/contracts.js';
import { infoRequests } from '../db/schema/misc.js';

type GigViewer = Pick<AccessTokenPayload, 'sub' | 'role' | 'emailVerified'>;

type GigVisibilityContext = {
  viewer: GigViewer | null;
  activeGigIds: Set<string>;
  grantedFields: Set<string>;
};

type VisibleGig = {
  id: string;
  posterId: string;
  priceType: string;
  visPrice: string;
  visCity: string;
  visAddress: string;
  visDates: string;
  longDescription: string | null;
  priceFixed: string | null;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  cityId: number | null;
  streetAddress: string | null;
  availableFrom: Date | null;
  availableTo: Date | null;
  [key: string]: unknown;
};

const isVisibilityContext = (value: unknown): value is GigVisibilityContext =>
  Boolean(value && typeof value === 'object' && 'activeGigIds' in value && 'grantedFields' in value);

export function optionalGigViewer(authorization: string | undefined): GigViewer | null {
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const { sub, role, emailVerified } = verifyAccessToken(authorization.slice(7));
    return { sub, role, emailVerified };
  } catch {
    return null;
  }
}

export async function loadGigVisibilityContext(viewer: GigViewer | null, gigIds: string[]): Promise<GigVisibilityContext> {
  const activeGigIds = new Set<string>();
  const grantedFields = new Set<string>();
  if (!viewer || gigIds.length === 0 || viewer.role === 'admin') {
    return { viewer, activeGigIds, grantedFields };
  }

  const activeContracts = await db.query.contracts.findMany({
    where: and(
      or(eq(contracts.posterId, viewer.sub), eq(contracts.workerId, viewer.sub)),
      inArray(contracts.gigId, gigIds),
      inArray(contracts.status, [...ACTIVE_CONTRACT_STATUSES]),
    ),
    columns: { gigId: true },
  });
  for (const contract of activeContracts) activeGigIds.add(contract.gigId);

  const requests = await db.query.infoRequests.findMany({
    where: and(
      eq(infoRequests.requesterId, viewer.sub),
      eq(infoRequests.status, 'granted'),
      inArray(infoRequests.gigId, gigIds),
    ),
    columns: { gigId: true, field: true },
  });
  for (const request of requests) grantedFields.add(`${request.gigId}:${request.field}`);

  return { viewer, activeGigIds, grantedFields };
}

export function presentGig<T extends VisibleGig>(gig: T, context: GigVisibilityContext | null | undefined): T {
  const safeContext = isVisibilityContext(context) ? context : {
    viewer: null,
    activeGigIds: new Set<string>(),
    grantedFields: new Set<string>(),
  };
  const viewer = safeContext.viewer;
  const isOwnerOrAdmin = viewer?.role === 'admin' || viewer?.sub === gig.posterId;
  const hasActiveContract = safeContext.activeGigIds.has(gig.id);

  const canSee = (level: string, field: string) => {
    if (isOwnerOrAdmin) return true;
    switch (level) {
      case 'public': return true;
      case 'authenticated': return Boolean(viewer);
      case 'verified': return Boolean(viewer?.emailVerified);
      case 'on_request': return safeContext.grantedFields.has(`${gig.id}:${field}`);
      case 'post_contract': return hasActiveContract;
      case 'private': return false;
      default: return false;
    }
  };

  const longDescriptionVisible = isOwnerOrAdmin || Boolean(viewer?.emailVerified) || hasActiveContract;
  const priceVisible = gig.priceType === 'negotiable' || canSee(gig.visPrice, 'price');

  return {
    ...gig,
    longDescription: longDescriptionVisible ? gig.longDescription : null,
    priceFixed: priceVisible ? gig.priceFixed : null,
    priceRangeMin: priceVisible ? gig.priceRangeMin : null,
    priceRangeMax: priceVisible ? gig.priceRangeMax : null,
    cityId: canSee(gig.visCity, 'city') ? gig.cityId : null,
    streetAddress: canSee(gig.visAddress, 'address') ? gig.streetAddress : null,
    availableFrom: canSee(gig.visDates, 'dates') ? gig.availableFrom : null,
    availableTo: canSee(gig.visDates, 'dates') ? gig.availableTo : null,
  };
}