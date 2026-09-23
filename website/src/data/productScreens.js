/**
 * Marketing product screens — one visual per copy block.
 * Files in website/public/screens/*.webp
 *
 * Hero          → loading (splash + logo)
 * How 01 Creezi → create (course maps / structure)
 * How 02 Atribui → assign (users & access)
 * How 03 Urmărești → track (progress per learner)
 * Showcase      → create / tests / track / library
 * Use cases     → assign / create / track
 * Analytics     → track
 */
export const PRODUCT_SCREENS = {
  loading: {
    src: '/screens/loading.webp',
    url: 'academy.formely.org',
    altKey: 'frames.loading',
  },
  create: {
    src: '/screens/create.webp',
    url: 'academy.formely.org/admin/content',
    altKey: 'frames.courseBuilder',
  },
  assign: {
    src: '/screens/assign.webp',
    url: 'academy.formely.org/admin/users',
    altKey: 'frames.navUsers',
  },
  track: {
    src: '/screens/track.webp',
    url: 'academy.formely.org/admin/statistics',
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
    src: '/screens/create.webp',
    url: 'academy.formely.org/admin/content',
    altKey: 'frames.courseBuilder',
  },
  people: {
    src: '/screens/assign.webp',
    url: 'academy.formely.org/admin/users',
    altKey: 'frames.navUsers',
  },
  progress: {
    src: '/screens/track.webp',
    url: 'academy.formely.org/admin/statistics',
    altKey: 'frames.progress',
  },
  analytics: {
    src: '/screens/track.webp',
    url: 'academy.formely.org/admin/statistics',
    altKey: 'frames.navStats',
  },
};

export const SCREEN_CAPTURE_PLAN = [
  { id: 'loading', path: 'splash', note: 'Hero — ecran loading cu logo Formely' },
  { id: 'create', path: '/admin/content?tab=courses&view=maps → open map', note: 'Creezi / Showcase cursuri — mape + cursuri' },
  { id: 'assign', path: '/admin/users', note: 'Atribui / Use case companii — utilizatori & acces' },
  { id: 'track', path: '/admin/statistics', note: 'Urmărești / Progres / Analytics — raport progres elevi' },
  { id: 'tests', path: '/admin/question-banks', note: 'Showcase teste — bănci de întrebări' },
  { id: 'library', path: '/library', note: 'Showcase bibliotecă' },
];
