import { presentGig } from '../lib/gig-visibility.js';

const gig = {
  id: '44444444-4444-4444-4444-444444444444',
  posterId: '11111111-1111-1111-1111-111111111111',
  shortDescription: 'Fix kitchen sink',
  longDescription: 'Private job details',
  regionId: 1,
  cityId: 2,
  streetAddress: 'Rustaveli Ave 10',
  priceType: 'fixed',
  priceFixed: '120.00',
  priceRangeMin: null,
  priceRangeMax: null,
  availableFrom: new Date('2026-05-01T10:00:00.000Z'),
  availableTo: new Date('2026-05-10T10:00:00.000Z'),
  visPrice: 'verified',
  visCity: 'verified',
  visAddress: 'on_request',
  visDates: 'post_contract',
};

const context = (overrides: Record<string, unknown> = {}) => ({
  viewer: null,
  activeGigIds: new Set<string>(),
  grantedFields: new Set<string>(),
  ...overrides,
});

describe('presentGig visibility projection', () => {
  it('removes restricted values from a visitor response but keeps city and price public', () => {
    const result = presentGig(gig, context());

    expect(result).toMatchObject({
      shortDescription: gig.shortDescription,
      longDescription: null,
      priceFixed: gig.priceFixed,
      cityId: gig.cityId,
      streetAddress: null,
      availableFrom: null,
      availableTo: null,
    });
    expect(result).not.toHaveProperty('visPrice');
    expect(result).not.toHaveProperty('visCity');
    expect(JSON.stringify(result)).not.toContain(gig.streetAddress);
    expect(JSON.stringify(result)).not.toContain(gig.longDescription);
  });

  it('grants verified and individually approved fields only', () => {
    const result = presentGig(gig, context({
      viewer: { sub: '22222222-2222-2222-2222-222222222222', role: 'user', emailVerified: true },
      grantedFields: new Set([`${gig.id}:address`]),
    }));

    expect(result.longDescription).toBe(gig.longDescription);
    expect(result.priceFixed).toBe(gig.priceFixed);
    expect(result.cityId).toBe(gig.cityId);
    expect(result.streetAddress).toBe(gig.streetAddress);
    expect(result.availableFrom).toBeNull();
  });

  it('reveals post-contract fields only while a related contract is active', () => {
    const viewer = { sub: '22222222-2222-2222-2222-222222222222', role: 'user', emailVerified: false };
    const active = presentGig(gig, context({ viewer, activeGigIds: new Set([gig.id]) }));
    const terminal = presentGig(gig, context({ viewer }));

    expect(active.longDescription).toBe(gig.longDescription);
    expect(active.availableFrom).toBe(gig.availableFrom);
    expect(terminal.longDescription).toBe(gig.longDescription);
    expect(terminal.availableFrom).toBeNull();
  });

  it('keeps private fields available to the owner and admin only', () => {
    const privateGig = { ...gig, visAddress: 'private' };
    const other = context({ viewer: { sub: '22222222-2222-2222-2222-222222222222', role: 'user', emailVerified: true } });
    const owner = context({ viewer: { sub: gig.posterId, role: 'user', emailVerified: false } });
    const admin = context({ viewer: { sub: '33333333-3333-3333-3333-333333333333', role: 'admin', emailVerified: false } });

    expect(presentGig(privateGig, other).streetAddress).toBeNull();
    expect(presentGig(privateGig, owner).streetAddress).toBe(gig.streetAddress);
    expect(presentGig(privateGig, admin).streetAddress).toBe(gig.streetAddress);
  });
});
