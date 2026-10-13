/**
 * Mirror of backend/config/plans.php — keep volumes + AI flags in sync with SaaS entitlements.
 */
export const saasPlanCatalog = {
  instructor: {
    id: 'instructor',
    max_active_learners: 50,
    max_staff: 2,
    ai_credits: 100,
    price: 70,
    priceSuffix: '/mo',
  },
  academie: {
    id: 'academie',
    max_active_learners: 250,
    max_staff: 6,
    ai_credits: 500,
    price: 256,
    priceSuffix: '/mo',
    recommended: true,
  },
  business: {
    id: 'business',
    max_active_learners: null,
    max_staff: 20,
    ai_credits: 2500,
    price: 499,
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

/** Plata anuală e cu 10% mai mică decât 12 luni la prețul lunar de lansare. */
export const annualDiscount = 10;

export function annualPrice(monthlyPrice) {
  return Math.round(monthlyPrice * 12 * (1 - annualDiscount / 100));
}

export function annualSavings(monthlyPrice) {
  return monthlyPrice * 12 - annualPrice(monthlyPrice);
}

/** Aceeași listă pe fiecare plan. Business e setul complet. */
export const planFeatureOrder = [
  'courses',
  'tests',
  'teams',
  'ai_tests',
  'ai_creator',
  'ai_builder',
  'ai_qa',
  'ai_stats',
  'library',
  'events',
  'analyst',
];

export const planFeatureIncluded = {
  courses: ['instructor', 'academie', 'business'],
  tests: ['instructor', 'academie', 'business'],
  teams: ['instructor', 'academie', 'business'],
  ai_tests: ['instructor', 'academie', 'business'],
  ai_creator: ['instructor', 'academie', 'business'],
  ai_builder: ['academie', 'business'],
  ai_qa: ['academie', 'business'],
  ai_stats: ['business'],
  library: ['academie', 'business'],
  events: ['academie', 'business'],
  analyst: ['academie', 'business'],
};
