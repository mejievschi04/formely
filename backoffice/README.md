# Formely Backoffice

Consolă separată pentru operatorii Formely: academii, planuri, locuri, cereri de acces și facturi.

Nu e LMS. Cursanții și staff-ul academiei rămân pe aplicația din `frontend/` (`http://localhost:5173`).

## Pornire locală

```bash
cd backoffice
npm install
npm run dev
```

Rulează pe **http://localhost:5180**.

Operator seed: `platform@formely.local` / `formely2025`.

## Ce face

- **Panou** — KPIs, coadă (trial, locuri, suspendări), mix de planuri, cereri noi
- **Clienți** — creare academie + invitație owner, plan/cap-uri, activare/suspendare
- **Cereri** — lead-uri de pe site, convertire în client
- **Planuri** — catalog Instructor / Academie / Business din API
- **Facturi** — bază operațională (documentele urmează)

## Pornire locală

```bash
cd backoffice
npm install
npm run dev
```

Rulează pe **http://localhost:5180**.

Operator seed: `platform@formely.local` / `formely2025`.
