# Formely — Site marketing (React)

Site public multi-pagină pentru promovarea platformei LMS. Separat de `frontend/` (aplicația autentificată).

## Stack

- **React 18** + **Vite 7**
- **React Router 6** — rute: `/platforma`, `/solutii`, `/preturi`, `/contact`, etc.
- **react-helmet-async** — meta SEO per pagină (title, description, Open Graph, canonical)

## Pagini

| Rută | Componentă |
|------|------------|
| `/` | HomePage |
| `/platforma` | PlatformPage |
| `/solutii` | SolutionsPage |
| `/preturi` | PricingPage |
| `/despre` | AboutPage |
| `/contact` | ContactPage |
| `/legal/*` | Privacy / Terms |

## Dezvoltare

```bash
cd website
cp .env.example .env
npm install
npm run dev
```

→ http://localhost:4321

## Variabile `.env`

| Variabilă | Descriere |
|-----------|-----------|
| `VITE_SITE_URL` | URL canonical (ex. https://formely.com) |
| `VITE_APP_URL` | Link „Intră în platformă” → LMS (ex. http://localhost:5173) |

## Build

```bash
npm run build
npm run preview
```

Output: `website/dist/`

## Deploy

- **Nginx / static host**: servește `dist/`; pentru SPA configurează `try_files $uri /index.html`
- **Producție recomandată**: `formely.com` → acest site · `app.formely.com` → `frontend/`

## SEO (React SPA)

- Meta dinamice via Helmet pe fiecare pagină
- JSON-LD: Organization, SoftwareApplication, FAQ, Article
- Pentru indexare maximă la scale: poți adăuga ulterior **prerender** (`vite-plugin-ssr` sau build static cu `react-snap`)

## Structură

```
website/
  src/
    components/   Header, Footer, Seo, CtaBand, JsonLd
    pages/        Pagini React
    data/site.js  Conținut & nav
    styles/       CSS (paletă Formely)
```
