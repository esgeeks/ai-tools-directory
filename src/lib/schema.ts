/**
 * Esquema tipado del catálogo. Compartido por el pipeline (escritura) y el sitio (lectura).
 * Regla: un campo desconocido queda vacío/null; nunca se rellena con suposiciones.
 */
import { z } from 'zod';
import { CATEGORY_IDS, PLATFORM_IDS, PRICING_IDS } from '../config/taxonomy.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/);
const httpsUrl = z.string().url().refine((u) => /^https:\/\//i.test(u), 'Solo URLs https');

export const SourceRefSchema = z.object({
  /** Conector que aportó el dato: github, huggingface, curated, awesome-list, rss… */
  connector: z.string(),
  /** Identificador original en la fuente (p. ej. owner/repo). */
  externalId: z.string(),
  url: httpsUrl,
  retrievedAt: isoDate,
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const TranslationStatus = z.enum(['original', 'machine', 'pending', 'failed', 'unavailable']);

export const DescriptionSchema = z.object({
  original: z.string(),
  originalLang: z.enum(['es', 'en', 'unknown']),
  es: z.string().nullable(),
  en: z.string().nullable(),
  status: z.object({ es: TranslationStatus, en: TranslationStatus }),
});

export const LocalizedListSchema = z.object({
  original: z.array(z.string()),
  es: z.array(z.string()).nullable(),
  en: z.array(z.string()).nullable(),
});
export type LocalizedList = z.infer<typeof LocalizedListSchema>;

export const MetricSchema = z.object({
  value: z.number(),
  /** Qué mide exactamente (se muestra literal; p. ej. "Estrellas en GitHub"). */
  kind: z.enum(['github_stars', 'github_forks', 'hf_likes']),
  source: z.string(),
  at: isoDate,
});

export const ImageSchema = z.object({
  url: httpsUrl,
  /** De dónde procede y por qué se puede usar (avatar de GitHub, og:image oficial…). */
  origin: z.enum(['github-avatar', 'hf-avatar', 'official-favicon', 'official-og-image', 'hf-thumbnail']),
  alt: z.string().optional(),
});

export const ToolSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: DescriptionSchema,
  categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])).min(1),
  tags: z.array(z.string()),
  platforms: z.array(z.enum(PLATFORM_IDS as [string, ...string[]])),
  license: z.object({
    spdx: z.string().nullable(),
    name: z.string().nullable(),
    /** true/false solo con evidencia; null = desconocido. */
    openSource: z.boolean().nullable(),
  }),
  pricing: z.enum(PRICING_IDS as [string, ...string[]]),
  /** Ejecución local / sin conexión: null = no confirmado. */
  localExecution: z.boolean().nullable(),
  offline: z.boolean().nullable(),
  urls: z.object({
    official: httpsUrl.nullable(),
    github: httpsUrl.nullable(),
    huggingface: httpsUrl.nullable(),
    download: httpsUrl.nullable(),
    docs: httpsUrl.nullable(),
    pricing: httpsUrl.nullable(),
  }),
  logo: ImageSchema.nullable(),
  screenshots: z.array(ImageSchema),
  /** Listas extraídas de la fuente (p. ej. sección "Features" del README), con traducciones. */
  features: LocalizedListSchema,
  requirements: LocalizedListSchema,
  related: z.array(z.string()),
  dates: z.object({
    discovered: isoDate,
    added: isoDate,
    /** Última actividad comprobada en la fuente (push, release, modificación del Space). */
    sourceUpdated: isoDate.nullable(),
    lastVerified: isoDate,
    /** Último cambio de contenido detectado por el pipeline entre ejecuciones. */
    lastChangeDetected: isoDate.nullable(),
  }),
  sources: z.array(SourceRefSchema).min(1),
  /** Campo → conector/fuente que lo respalda. */
  provenance: z.record(z.string(), z.string()),
  metrics: z.array(MetricSchema),
  validation: z.object({
    status: z.enum(['published', 'review', 'rejected']),
    checks: z.record(z.string(), z.boolean()),
    reasons: z.array(z.string()),
    /** Re-verificaciones fallidas seguidas. Solo se despublica tras varias (protege ante caídas temporales). */
    consecutiveFailures: z.number().int().min(0).default(0),
  }),
  /** Monetización futura (desactivada). Si se activa, se etiqueta visiblemente. */
  sponsored: z.boolean().default(false),
  affiliateUrl: httpsUrl.nullable().default(null),
});
export type Tool = z.infer<typeof ToolSchema>;

export const CatalogSchema = z.object({
  version: z.literal(1),
  generatedAt: isoDate,
  tools: z.array(ToolSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
