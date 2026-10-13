/**
 * Marketing product screens — fallback shots when interactive=false.
 * Prefer InteractiveProductDemos (HTML from real LMS flows).
 * Files in website/public/screens/*.webp
 *
 * Hero / How 01 → aiSetup interactive (AdminAiOnboarding)
 * How 02        → assign interactive (users invite)
 * How 03        → track interactive (statistics)
 * Demo / Showcase → aiSetup / create / tests / assign / track
 */
export const PRODUCT_SCREENS = {
  loading: {
    src: '/screens/loading.webp',
    url: 'academy.formely.org',
    altKey: 'frames.loading',
  },
  create: {
    src: '/screens/course-editor.png',
    width: 2880,
    height: 2000,
    url: 'academy.formely.org/admin/courses',
    altKey: 'frames.courseBuilder',
  },
  assign: {
    src: '/screens/team-invite.png',
    width: 2880,
    height: 2000,
    url: 'academy.formely.org/admin/users',
    altKey: 'frames.navUsers',
  },
  track: {
    src: '/screens/team-progress.png',
    width: 2632,
    height: 1400,
    url: 'academy.formely.org/admin',
    altKey: 'frames.progress',
  },
  tests: {
    src: '/screens/tests.webp',
    url: 'academy.formely.org/admin/question-banks',
    altKey: 'frames.test',
  },
  library: {
    src: '/screens/library.webp',
    url: 'academy.formely.org/library',
    altKey: 'frames.library',
  },
  // Back-compat aliases used by older call sites
  dashboard: {
    src: '/screens/loading.webp',
    url: 'academy.formely.org',
    altKey: 'frames.loading',
  },
  courses: {
    src: '/screens/course-editor.png',
    width: 2880,
    height: 2000,
    url: 'academy.formely.org/admin/courses',
    altKey: 'frames.courseBuilder',
  },
  people: {
    src: '/screens/team-invite.png',
    width: 2880,
    height: 2000,
    url: 'academy.formely.org/admin/users',
    altKey: 'frames.navUsers',
  },
  progress: {
    src: '/screens/team-progress.png',
    width: 2632,
    height: 1400,
    url: 'academy.formely.org/admin',
    altKey: 'frames.progress',
  },
  analytics: {
    src: '/screens/team-progress.png',
    width: 2632,
    height: 1400,
    url: 'academy.formely.org/admin',
    altKey: 'frames.navStats',
  },
};

export const SCREEN_CAPTURE_PLAN = [
  { id: 'loading', path: 'splash', note: 'Hero — ecran loading cu logo Formely' },
  { id: 'create', path: '/admin/content?tab=courses&view=list → Editează cursul', note: 'Editorul cu o lecție deschisă și structura cursului' },
  { id: 'assign', path: '/admin/users → Invitații → Invitație nouă', note: 'Formularul de invitație, fără trimitere' },
  { id: 'track', path: '/admin', note: 'Indicatori și primele două grafice complete din academia demo' },
  { id: 'tests', path: '/admin/question-banks', note: 'Showcase teste — bănci de întrebări' },
  { id: 'library', path: '/library', note: 'Showcase bibliotecă' },
];
