# Volta Academy - Design Verification

## Design System Overview

### Tokenuri CSS (design-system.css)

| Categorie | Variabile | Utilizare |
|-----------|-----------|-----------|
| **Culori** | `--color-brand-primary`, `--color-primary-alpha-*` | Brand, overlays, focus |
| **Spațiere** | `--space-1` până la `--space-16`, `--space-2-5` | Padding, margin, gap |
| **Tipografie** | `--font-size-*`, `--font-weight-*`, `--line-height-*` | Text consistent |
| **Radius** | `--radius-sm` până la `--radius-full` | Colțuri rotunjite |
| **Umbre** | `--shadow-sm` până la `--shadow-2xl`, `--shadow-focus` | Elevare, focus |
| **Breakpoints** | `--breakpoint-sm` (640px) până la `--breakpoint-2xl` (1536px) | Responsive |

### Checklist Verificare Design

- [ ] **Culori**: Folosește `var(--color-*)` în loc de hex/rgba hardcodat
- [ ] **Spațiere**: Folosește `var(--space-*)` pentru padding/margin
- [ ] **Focus**: Elemente interactive au `:focus-visible` vizibil
- [ ] **Touch**: Butoane/links min 44x44px pe mobile
- [ ] **Input**: Font-size 16px pe mobile (previne zoom iOS)
- [ ] **Contrast**: Text AA/AAA conform WCAG
- [ ] **Reduced Motion**: `prefers-reduced-motion` respectat

### Teme

- **Dark** (implicit): `--bg-primary: #121212`, text alb/gri
- **Light**: `[data-theme="light"]` - fundal gri deschis, text închis

### Accesibilitate

- Focus ring: `outline: 2px solid var(--border-focus)`
- Selection: `var(--color-primary-alpha-20)`
- Reduced motion: animații și tranziții dezactivate când utilizatorul preferă
