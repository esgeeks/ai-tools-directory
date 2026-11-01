# AI Tools Directory

Directorio bilingüe (español / inglés) de herramientas de inteligencia artificial que **descubre, verifica, clasifica y publica automáticamente** herramientas reales cada día.

- Sitio: `https://tools.iathink.com` (GitHub Pages + dominio propio)
- Stack: Astro (estático) · TypeScript · Tailwind CSS · GitHub Actions · JSON · `localStorage`
- Tipografía: Zen Dots (logo y título principal) + Poppins (resto), autoalojadas
- Sin servidor permanente, sin servicios de pago, sin cuentas de usuario.

---

## Arquitectura

```
Captura (connectors) → Normalización → Verificación → Clasificación → Traducción → Almacenamiento (data/*.json) → Generación (Astro) → Publicación (Pages)
```

| Etapa | Módulo |
|---|---|
| 1. Captura de fuentes | `pipeline/connectors/*.ts` (un archivo por fuente, configuración en `sources/sources.json`) |
| 2. Normalización | `pipeline/lib/sanitize.ts`, `pipeline/lib/url.ts`, `pipeline/lib/html.ts`, `pipeline/process.ts` |
| 3. Verificación | `pipeline/process.ts` (comprobaciones `hard` → rechazo, `soft` → revisión) |
| 4. Clasificación | `pipeline/classify.ts` (categorías, plataformas, precio, licencia, local/offline) |
| 5. Traducción | `pipeline/translate.ts` + `pipeline/translate/argos_translate.py` |
| 6. Almacenamiento | `pipeline/store.ts` → `data/` |
| 7. Generación de páginas | `src/` (Astro) |
| 8. Publicación | `.github/workflows/daily-update.yml` |

### Estructura de carpetas

```
├── .github/
│   ├── workflows/daily-update.yml   # cron diario + manual + despliegue a Pages
│   ├── workflows/ci.yml             # pruebas y build en PRs/ramas
│   └── ISSUE_TEMPLATE/suggest-tool.yml
├── data/                            # catálogo y registros (los escribe el pipeline)
│   ├── catalog.json                 # fichas (published + review)
│   ├── rejected.json                # descartadas y motivo (se reintentan pasado un tiempo)
│   ├── trends.json                  # tendencias calculadas con historial propio
│   ├── translation-cache.json       # caché de traducciones (hash → texto)
│   ├── history/metrics.json         # serie diaria de estrellas/likes (120 días)
│   ├── history/changes.json         # altas, cambios y despublicaciones
│   └── runs/latest.json, history.json, deploy.json   # informes de ejecución
├── pipeline/                        # descubrimiento automático (Node + tsx)
├── sources/
│   ├── sources.json                 # configuración por fuente y límites
│   └── curated.json                 # lista curada de herramientas con URL oficial
├── src/
│   ├── config/site.ts               # MARCA: nombre, logo, dominio, colores, monetización
│   ├── config/taxonomy.ts           # categorías, plataformas, precios (+ palabras clave)
│   ├── i18n/                        # textos de interfaz y rutas localizadas
│   ├── lib/                         # esquema (zod), catálogo, filtros, favoritos/comparador
│   ├── components/, views/, layouts/, pages/, scripts/, styles/
└── tests/                           # Vitest (fixtures ficticios en tests/fixtures, nunca publicados)
```

### Cambiar la marca

Todo está en `src/config/site.ts` (nombre, logotipo textual, URL, colores, umbrales, monetización) y los colores CSS en `src/styles/global.css` (`@theme`). Si cambias el dominio, actualiza también `public/CNAME`.

---

## Fuentes de datos implementadas

| Fuente | Estado | Notas |
|---|---|---|
| **GitHub Search API** | ✅ | 20 consultas por temas (configurables). Usa el `GITHUB_TOKEN` automático de Actions (gratis). README desde `raw.githubusercontent.com` (no gasta cuota), releases desde la API. |
| **Hugging Face Spaces** | ✅ | `/api/spaces` (trending, likes, recientes). Solo Spaces en ejecución (`RUNNING`); no se consultan modelos ni datasets. |
| **Lista curada** | ✅ | `sources/curated.json`: 57 herramientas comerciales con URL oficial. Se verifican contra el sitio oficial respetando `robots.txt`. |
| **Listas públicas abiertas** | ✅ | Listas *awesome* con licencia verificada (CC0/MIT/Apache/CC-BY). Solo aportan URLs candidatas; su texto no se publica. |
| **RSS/Atom** | ✅ | `hnrss.org` (Show HN con "AI"). Cada enlace se verifica en su fuente original. |
| Product Hunt / APIs con token | ❌ | Requieren token o condiciones de uso; desactivadas por decisión (sin tokens ni pagos). |

Si una fuente falla, se registra en `data/runs/latest.json → sourceErrors` y el resto continúa.

## Verificación (resumen)

**Rechazo** (no se publica, va a `rejected.json`): sin evidencia de IA, listas/datasets/prompts/papers, bibliotecas sin señales de app, repos archivados/forks/plantillas, Spaces que no están en ejecución.

**Revisión** (se guarda pero no se publica): descripción insuficiente, sin plataformas con evidencia, sin evidencia de funcionamiento (release, sitio/demo comprobado o instrucciones de instalación), idioma no soportado, inactivo más de 18 meses, sitio oficial inaccesible.

Las fichas en revisión se re-evalúan automáticamente en ejecuciones posteriores.

**Protecciones**: máximo 30 altas por día; una ficha publicada solo se despublica tras 3 verificaciones fallidas seguidas; si una ejecución intenta despublicar más del 10 %, se revierte; si el catálogo resultante no valida, se conserva el anterior.

## Traducción

Argos Translate (open source, local) en GitHub Actions, con modelos cacheados. Solo traduce textos nuevos o modificados (`data/translation-cache.json`), protege nombres, URLs, cifras y términos técnicos, y descarta traducciones defectuosas. Si no hay traducción fiable se muestra el original con aviso y la ficha de ese idioma queda `noindex`. Para usar otro proveedor, implementa la interfaz `Translator` en `pipeline/translate.ts`.

---

## Puesta en marcha (una sola vez)

1. **Fusionar** la rama de desarrollo en `main`.
2. **Activar Pages**: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. **Dominio**: en *Settings → Pages → Custom domain* escribe `tools.iathink.com` y guarda. Cuando el certificado esté listo, marca **Enforce HTTPS**.
4. **DNS** (en tu proveedor de `iathink.com`): registro `CNAME` · nombre `tools` · valor `esgeeks.github.io`.
5. (Recomendado) **Verificar el dominio**: *Settings de tu cuenta/organización → Pages → Add a domain* y añade el registro TXT que indica GitHub.
6. **Primera ejecución**: *Actions → Actualización diaria y despliegue → Run workflow*.

No hace falta crear secretos: el workflow usa el `GITHUB_TOKEN` automático.

## Comandos

```bash
npm ci                 # dependencias
npm run dev            # servidor local
npm test               # pruebas (Vitest)
npm run build          # sitio estático en dist/
npm run pipeline       # ejecuta el descubrimiento (escribe data/)
npm run pipeline:dry   # simulación sin escribir
npx tsx pipeline/run.ts --only=github,curated --no-translate --skip-reverify
```

## Mantenimiento

- **Añadir una herramienta comercial**: agrega una entrada a `sources/curated.json` (nombre, URL oficial, categorías y, si existe, `pricingUrl`).
- **Añadir una fuente**: crea un conector en `pipeline/connectors/` que implemente `Connector`, añade su bloque en `sources/sources.json` y regístralo en `pipeline/run.ts`.
- **Ajustar categorías**: edita `src/config/taxonomy.ts` (etiquetas, slugs y palabras clave).
- **Revisar descartes**: `data/rejected.json` y `data/runs/latest.json`.
- **Monetización** (desactivada): `site.monetization` en `src/config/site.ts`. Al activarla, los elementos patrocinados se etiquetan como "Patrocinado" y los enlaces de afiliado usan `rel="sponsored nofollow"`.

## Aviso

Se verifican **metadatos**, no la seguridad del software. El pipeline nunca instala ni ejecuta el software descubierto.

Licencia del código: MIT.
