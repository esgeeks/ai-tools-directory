/**
 * Contrato común de los conectores. Cada conector solo CAPTURA candidatos;
 * normalización, verificación, clasificación y traducción ocurren en etapas separadas.
 */
import type { PlatformId, PricingId } from '../../src/config/taxonomy.ts';
import type { PageMeta } from '../lib/html.ts';

export interface GithubData {
  fullName: string;
  description: string;
  homepage: string | null;
  topics: string[];
  license: { spdx: string | null; name: string | null };
  archived: boolean;
  fork: boolean;
  isTemplate: boolean;
  pushedAt: string | null;
  createdAt: string | null;
  stars: number;
  forks: number;
  ownerAvatar: string | null;
  language: string | null;
  readme: string | null;
  release: { tag: string; publishedAt: string | null; assets: string[]; url: string } | null;
  disabled?: boolean;
}

export interface HfSpaceData {
  id: string;
  title: string | null;
  shortDescription: string | null;
  readme: string | null;
  sdk: string | null;
  runtimeStage: string | null;
  likes: number;
  lastModified: string | null;
  createdAt: string | null;
  tags: string[];
  license: string | null;
  private: boolean;
  disabled: boolean;
}

/** Afirmaciones editoriales (lista curada). El verificador las confirma o las descarta. */
export interface CuratedClaims {
  description?: string;
  categories?: string[];
  platforms?: PlatformId[];
  /** El sitio oficial es una aplicación web utilizable en el navegador. */
  webApp?: boolean;
  pricingUrl?: string;
  downloadUrl?: string;
  githubUrl?: string;
  openSource?: boolean;
  pricing?: PricingId;
}

export interface Candidate {
  connector: string;
  externalId: string;
  sourceUrl: string;
  retrievedAt: string;
  name: string;
  /** Texto original sin limpiar (se sanea en normalize). */
  description: string;
  homepage: string | null;
  github?: GithubData;
  hf?: HfSpaceData;
  page?: PageMeta & { status: number; finalUrl: string };
  pricingPage?: { status: number; text: string; url: string } | null;
  claims?: CuratedClaims;
  /** Pista del conector de origen (lista o feed concreto). */
  via?: string;
  /** Texto de apoyo de una lista o feed: solo para clasificar, nunca se publica. */
  hint?: string;
}

export interface ConnectorContext {
  now: Date;
  log: (msg: string) => void;
  /** IDs externos ya conocidos (para no gastar cuota en enriquecerlos de nuevo). */
  known: Set<string>;
  /** Registra un error de la fuente sin detener la ejecución. */
  error: (source: string, msg: string) => void;
  budget: { githubCalls: number };
}

export interface Connector<C = Record<string, unknown>> {
  id: string;
  run(ctx: ConnectorContext, config: C): Promise<Candidate[]>;
}
