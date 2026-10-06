# Roluri staff: Instructor, Analist, Admin

## Instructor

Rolul **instructor** permite crearea și gestionarea **conținutului LMS** (cursuri, builder, module, lecții, examene, teste, bănci de întrebări, media, generare AI conținut), **fără** zona organizațională (utilizatori, echipe, evenimente admin, mape de cursuri, setări, statistici admin, export/import).

### Permisiuni (în limitele controllere-lor)

- **Cursuri**: CRUD doar unde `teacher_id` = utilizatorul curent (builder, module, lecții, teste atașate).
- **Teste**: CRUD doar pentru `created_by` = utilizatorul curent.
- **Bănci de întrebări**: CRUD doar pentru `created_by` = utilizatorul curent.
- **Examene** (legacy): doar pentru cursurile unde este `teacher_id`.
- **Media**: listare; ștergere doar pentru fișiere încărcate de el.

### Restricții la nivel de rută API

- `InstructorContentScopeMiddleware` blochează prefixe precum: `users`, `team-members`, `teams`, `events`, `settings`, `activity-logs`, `statistics`, `export`, `import`, `system`, `course-maps`, `courses/bulk-actions`.

### Setare rol

- `users.role = 'instructor'` sau din panoul Utilizatori (rol „Instructor”).

---

## Analist (`analyst`)

Vede aceleași date ca adminul prin **GET** pe rutele `/api/admin/*`, dar **nu poate** executa `POST`, `PUT`, `PATCH`, `DELETE` (inclusiv acțiuni tip review, import, clear cache). Implementat prin `AnalystReadOnlyMiddleware`.

Setare: `users.role = 'analyst'` sau din panoul Utilizatori (rol „Analist”).

---

## Middleware pe `/api/admin`

1. `StaffAreaAccessMiddleware` — permite `admin`, `instructor`, `analyst`.
2. `AnalystReadOnlyMiddleware` — pentru `analyst`, doar metode sigure (GET/HEAD/OPTIONS).
3. `InstructorContentScopeMiddleware` — pentru `instructor`, interzice prefixele de mai sus.

Controllerele păstrează verificări suplimentare (ex.: instructor doar pe resurse proprii).
