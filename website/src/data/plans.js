/**
 * Mirror of backend/config/plans.php — keep volumes in sync with SaaS entitlements.
 */
export const saasPlanCatalog = {
  instructor: {
    id: 'instructor',
    max_active_learners: 50,
    max_staff: 2,
    price: 49,
    priceSuffix: '/mo',
  },
  academie: {
    id: 'academie',
    max_active_learners: 250,
    max_staff: 6,
    price: 129,
    priceSuffix: '/mo',
    recommended: true,
  },
  business: {
    id: 'business',
    max_active_learners: null,
    max_staff: 20,
    price: 249,
    priceSuffix: '/mo',
    pricePrefix: 'from',
  },
};

export const planOrder = ['instructor', 'academie', 'business'];

/** Ofertă de lansare: −30% pentru primii 50 de clienți. Prețul din catalog rămâne cel de listă. */
export const launchOffer = { percent: 30, spots: 50 };

export function launchPrice(listPrice) {
  return Math.round(listPrice * (1 - launchOffer.percent / 100));
}

/** Aceeași listă pe fiecare plan. Business e setul complet. */
export const planFeatureOrder = [
  'courses',
  'tests',
  'teams',
  'library',
  'events',
  'analyst',
];

export const planFeatureIncluded = {
  courses: ['instructor', 'academie', 'business'],
  tests: ['instructor', 'academie', 'business'],
  teams: ['instructor', 'academie', 'business'],
  library: ['academie', 'business'],
  events: ['academie', 'business'],
  analyst: ['academie', 'business'],
};
