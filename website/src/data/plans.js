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
    max_active_learners: 150,
    max_staff: 10,
    price: 129,
    priceSuffix: '/mo',
    recommended: true,
  },
  business: {
    id: 'business',
    max_active_learners: null,
    max_staff: 50,
    price: 249,
    priceSuffix: '/mo',
    pricePrefix: 'from',
  },
};

export const planOrder = ['instructor', 'academie', 'business'];
