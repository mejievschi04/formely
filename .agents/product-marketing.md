# Product Marketing Context

**Document version:** v4.1  
**Last updated:** 2026-10-12

> Context validat de fondator (Oct 2026). Packaging AI pe planuri = decizie de lucru de mai jos; implementarea e în `plans.php` + cote + GTM (vezi planul de repornire).

## Product Overview
**One-liner:** Formely e LMS-ul cu AI pentru firme mici și mijlocii din RO/MD — din materialele pe care le ai deja, faci onboarding și teste pe care le poți urmări.  
**What it does:** Companiile creează cursuri (module, lecții, video/PDF/text), generează sau completează conținut și teste cu Formely AI (Volt), invită angajații pe email și văd progresul, notele și certificatele. Activarea e sales-assisted (formular → contact în 24h → 14 zile gratuit).  
**Product category:** LMS / employee training / corporate onboarding (căutări: „platformă training angajați”, „LMS România”, „onboarding angajați AI”).  
**Product type:** B2B SaaS (multi-tenant academy), sales-led activation.  
**Business model:** Abonament lunar/anual pe 3 planuri (Instructor / Academie / Business), preț după nr. de cursanți + feature flags (library, events, AI). Ofertă lansare −30% primii 50 clienți. Prețuri listă: €49 / €129 / de la €249 → lansare ~€34 / €90 / de la €174.

### Formely AI (în produs azi)
| Capacitate | Feature flag | Plan azi (`plans.php`) |
|---|---|---|
| Generare curs + extract document | `ai_creator` | Instructor + Academie + Business |
| Builder edit curs | `ai_builder` | Academie + Business |
| Generare teste / întrebări | `ai_test_generation` | Instructor + Academie + Business |
| Asistent Q&A admin | `ai_qa` | Academie + Business |
| Tutor / study tools pe lecții | `ai_tutor` | **OFF** pe toate planurile |
| Insights / export stats AI | `ai_stats` | Business |

**Wedge ales (GTM):** *Încarci materialele → AI face cursul + testele → inviți echipa.*  

**Packaging AI (implementat în `plans.php` + `AiQuotaService`, Oct 2026):** pool lunar de **credite** (nu cote separate pe curs/test).

| Plan | AI inclus | Credite / lună |
|---|---|---|
| Instructor (+ trial) | `ai_test_generation` + `ai_creator` | **100** |
| Academie | + `ai_builder` + `ai_qa` | **500** |
| Business | full (QA, stats, …; fără tutor learner) | **2500** |

Cost pe acțiune (`config/ai.php` → `credit_costs`): curs/builder **15**, test **3**, Q&A admin **1**.

Nume marketing public: **Formely AI** (Volt rămâne intern/tech). Entitlements API expune `ai_usage.credits` + `costs`.

## Target Audience
**Target companies:** Firme 10–100 angajați în România și Moldova (retail, servicii, producție ușoară, agenții, academii mici); operațiuni unde onboarding-ul se repetă.  
**Decision-makers:** Owner / director operațional; HR / People (unde există); uneori trainer intern sau head of sales (training produs).  
**Primary use case:** Onboarding angajați noi — același traseu, test, progres vizibil.  
**Jobs to be done:**
- Să nu mai explice de 10 ori aceleași proceduri
- Să știe cine a terminat trainingul (compliance / calitate)
- Să lase know-how-ul în firmă când managerele pleacă
**Use cases:**
- Onboarding (pagină dedicată `/onboarding`)
- Proceduri interne
- Instruiri obligatorii + certificate
- Training vânzări / produs
- Academii / traineri (plan Academie)

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Owner / COO | Timp, greșeli costisitoare, scalare fără haos | Trainingul stă în capul a 1–2 oameni | Onboarding standard + AI care scurtează crearea cursului |
| HR / People | Consistență, dovezi, adopție | PDF-uri pe WhatsApp, zero tracking | Progres, teste, certificate într-un loc |
| Trainer / L&D (intern) | Viteza de a livra conținut | Construiește manual fiecare curs/test | Generare AI + editare, apoi livrare la echipă |
| Angajat (user) | Simplitate pe telefon | Nu vrea altă app grea | Browser, invitație email, clar ce are de făcut |

## Problems & Pain Points
**Core problem:** Trainingul e oral sau pe WhatsApp — se repetă, e inconsistent, nu poți dovedi că s-a înțeles.  
**Why alternatives fall short:**
- WhatsApp / Drive / PDF — ieftin, zero progres, zero teste
- LMS enterprise (SAP, Docebo) — scump, greu, IT
- LMS globale (TalentLMS etc.) — puternice, dar engleză-first / setup generic; rar „te ajutăm mâine în RO/MD”
- Suite HR+AI (Sintegrum) — mai lat (recrutare + AI), poate fi overkill dacă vrei doar training controlat
**What it costs them:** Zile de mentor; greșeli la clienți; re-onboarding la fiecare angajare; know-how pierdut la churn.  
**Emotional tension:** „Depindem de omul-cheie”; frica că noul angajat „nu știe și nu știm că nu știe”.

## Competitive Landscape
**Direct:** LMS cloud pentru training intern (TalentLMS, LearnWorlds, Easy LMS) — cad short pentru SME local: preț/complexitate, suport RO/MD, activare asistată.  
**Direct (regional):** Sintegrum — AI + HR lat; Formely e mai îngust pe LMS training/onboarding.  
**Secondary:** RevoHR (training pe WhatsApp, multi-limbă) — bun la livrare field; Formely e portal + progres + teste + AI pe conținut.  
**Indirect:** „Facem noi în Google Drive / Notion / Excel” — zero cost aparent, cost real în timp și inconsistente.

## Differentiation
**Key differentiators:**
- Formely AI pe fluxul real de training (curs din documente, teste, tutor) — nu doar „AI pe slide”
- Focus SME RO/MD: limbi (ro/en/ru/it), setup asistat 24h, prețuri publice
- Simplitate: fără IT, mobile browser, primul curs în ~1 zi
**How we do it differently:** Sales-assisted activation + AI care scurtează crearea conținutului, apoi LMS clasic (progres, teste, certificate).  
**Why that's better:** Scade efortul de a *porni* trainingul (AI) și riscul de a nu ști dacă s-a făcut (LMS).  
**Why customers choose us:** **[VALIDEAZĂ]** — ipoteză: viteză + local + AI util pe onboarding, nu suite HR enterprise.

## Objections
| Objection | Response |
|-----------|----------|
| „De ce nu mă înscriu singur?” | Activăm manual ca să configurăm primul curs (inclusiv cu AI) și să evităm setup greșit; răspuns în 24h, apoi 14 zile. |
| „Avem deja Drive / WhatsApp” | Acolo nu vezi progres, note, certificate; AI + LMS îți dau traseu + dovadă. |
| „AI inventă prostii” | AI propune; tu editezi și publici. Materialele tale rămân sursa; testele verifică înțelegerea. |
| „E scump față de free tools” | &lt;€1/angajat pe Instructor la lansare; costul real e timpul mentorului. |

**Anti-persona:** Enterprise care vrea HCM full (SAP/SuccessFactors); firme care vor doar chatbot HR fără cursuri structurate; solopreneurs fără echipă de instruit.

## Switching Dynamics
**Push:** Repetiție, haos WhatsApp, zero vizibilitate, om-cheie epuizat.  
**Pull:** Curs + test din materiale existente (AI), progres clar, start rapid local.  
**Habit:** „Trimitem PDF-ul pe grup”; mentoratul informal.  
**Anxiety:** Migrare conținut, „încă un tool”, calitate AI, date angajați / GDPR.

## Customer Language
**How they describe the problem:**
- „Aceeași explicație, a zecea oară”
- „Le trimiți pe WhatsApp și speri”
- „Pleacă omul, pleacă și know-how-ul”
**How they describe us:**
- **[VALIDEAZĂ — încă fără citate reale]** „Trainingul angajaților, într-un singur loc”
**Words to use:** onboarding, progres, teste, certificat, primul curs în 1 zi, Formely AI, din materialele tale, RO & MD, fără IT  
**Words to avoid:** revolutionary, AI-powered (gol), enterprise HCM, „clonarea angajaților” (poziție Sintegrum), self-serve trial (până nu există)  
**Glossary:**
| Term | Meaning |
|------|---------|
| Formely AI / Volt | Stratul AI din produs (provider configurabil: Groq/OpenAI/HF) |
| Activare | Cont creat după cerere + confirmare (nu signup public) |
| Cursant / learner | Angajat sau student cu acces la cursuri |
| Staff | Locuri admin/trainer pe plan |
| Academie | Tenant / organizație pe platformă |

## Brand Voice
**Tone:** Direct, calm, practic — SME, nu corporate jargon.  
**Style:** Conversațional-clar; propoziții scurte; outcome înainte de feature.  
**Personality:** Local, onest, competent, fără hype.

## Proof Points
**Metrics:** **[VALIDEAZĂ]** — marketing claims pe site: 1 zi până la primul curs; 14 zile gratuit; &lt;€1/angajat pe Instructor (lansare). Nu inventăm nr. de clienți.  
**Customers:** Niciun logo public încă — trust strip onest („citate când avem cazuri”).  
**Testimonials:** *(gol — prioritate post-pilot)*  
**Value themes:**
| Theme | Proof |
|-------|-------|
| Viteza de start | Setup asistat + claim 1 zi; AI scurtează crearea |
| Control / dovadă | Progres, note, certificate în panou |
| Cost accesibil SME | Prețuri publice + lansare −30% |
| AI util | Capacități în app (curs/test/tutor) + copy pe landing (soft relaunch P2) |

## Goals
**Business goal:** Primii clienți plătitori din RO/MD prin wedge AI pe onboarding/training.  
**Conversion action:** Cerere de activare (lead) → call 24h → trial 14 zile → plan plătit.  
**Current metrics:** ~300 vizite landing, 0 cereri (pre-CRO); post Faza 1–3 site + P0 packaging AI + P1 guided setup (`/admin/ai-setup`) + P2 soft relaunch (copy AI pe site, toate limbile). **Țintă:** 1–3% lead rate pe trafic similar după AI vizibil + demo-ready.

## Open product decisions
1. ~~AI pe Instructor~~ → da, limitat (vezi packaging)  
2. Self-serve signup vs gated — rămâne **gated** la repornire; self-serve = fază ulterioară  
3. ~~Nume~~ → **Formely AI** public; Volt intern  
4. **Profil AI (fondator):** ON = curs din materiale, builder edit, teste, admin Q&A, extract local, embeddings, **OpenAI only**, quality model pe curs. **Fără** tutor / study tools pe lecții. DEFER = OpenAI Files PDF, packaging fin pe planuri.  

## Changelog
*Newest first. One line per revision: what changed and why.*
- v4.3 (2026-10-12) — `ai_tutor` OFF pe toate planurile (fără tutor/study tools pe lecții); Q&A admin rămâne.
- v4.2 (2026-10-12) — Limite AI pe credite (100 / 500 / 2500); cost curs 15 / test 3 / Q&A 1; pool unic lunar.
- v4.1 (2026-10-12) — Profil AI + cote: Academie `ai_qa` cu 150 Q&A/lună; Instructor 5/20/0; Business 100/500/2000; tutor learner deferred.
- v4 (2026-10-12) — Soft relaunch: wedge AI pe site (ro/en/ru/it) + guided setup in-app; P0/P1 packaging+wizard livrate.
- v3 (2026-10-12) — Packaging AI marcat implementat (plans.php + cote + entitlements.ai_usage).
- v2 (2026-10-12) — Fondator a validat contextul; packaging AI pe planuri + Formely AI ca nume public; gated rămâne la repornire.
- v1 (2026-10-12) — Initial context: LMS SME RO/MD + wedge Formely AI (curs/teste din materiale); sales-led activation; competitors and packaging gaps marked for validation.
