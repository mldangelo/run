import snapshot from '../fixtures/snapshot.json' with { type: 'json' };

// Navigation tests freeze time at November 9. Keep availability independent
// of research checks that can advance beyond that clock or change status.
export const soldOutRace = {
  ...snapshot.races[0],
  registration: {
    status: 'sold_out',
    source_url: 'https://example.org/race',
    checked_on: '2026-11-08',
    review_due: '2026-11-15',
    access_method: 'web',
    notes: 'Registration is sold out.',
  },
};
