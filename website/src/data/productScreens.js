/**
 * Real product screens for the marketing site.
 * Files live in website/public/screens/*.webp (or .png).
 * Capture from academy.formely.org (admin dark theme, sample data, no PII).
 */
export const PRODUCT_SCREENS = {
  dashboard: {
    src: '/screens/dashboard.webp',
    url: 'academy.formely.org/admin',
    altKey: 'frames.dashboardTitle',
  },
  courses: {
    src: '/screens/courses.webp',
    url: 'academy.formely.org/admin/courses',
    altKey: 'frames.courseBuilder',
  },
  tests: {
    src: '/screens/tests.webp',
    url: 'academy.formely.org/admin/question-banks',
    altKey: 'frames.test',
  },
  progress: {
    src: '/screens/progress.webp',
    url: 'academy.formely.org/courses',
    altKey: 'frames.progress',
  },
  people: {
    src: '/screens/people.webp',
    url: 'academy.formely.org/admin/users',
    altKey: 'frames.navUsers',
  },
  library: {
    src: '/screens/library.webp',
    url: 'academy.formely.org/library',
    altKey: 'frames.library',
  },
  analytics: {
    src: '/screens/analytics.webp',
    url: 'academy.formely.org/admin/statistics',
    altKey: 'frames.navStats',
  },
};

/** Which LMS route to capture for each marketing slot */
export const SCREEN_CAPTURE_PLAN = [
  { id: 'dashboard', path: '/admin', note: 'Hero — panou admin KPI' },
  { id: 'courses', path: '/admin/content?tab=courses&view=maps', note: 'Showcase / How — mape + builder context; prefer open builder if possible' },
  { id: 'tests', path: '/admin/question-banks', note: 'Showcase — bănci / teste' },
  { id: 'progress', path: '/courses', note: 'Showcase / How / Use cases — elev: cursuri + progres' },
  { id: 'people', path: '/admin/users', note: 'How / Use cases — utilizatori & invitații' },
  { id: 'library', path: '/library', note: 'Showcase — bibliotecă' },
  { id: 'analytics', path: '/admin/statistics', note: 'Analytics section — hub statistici' },
];
