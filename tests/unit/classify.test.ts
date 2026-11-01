import { describe, expect, it } from 'vitest';
import { aiEvidence, applicationEvidence, classifyCategories, detectOffline, detectPlatforms, detectPricing, extractSection, FEATURES_HEADING, licenseInfo } from '../../pipeline/classify.ts';
import { processCandidate } from '../../pipeline/process.ts';
import type { Candidate, GithubData } from '../../pipeline/connectors/types.ts';

const NOW = new Date('2026-11-01T06:00:00Z');

function gh(over: Partial<GithubData> = {}): GithubData {
  return {
    fullName: 'example/sample-app', description: '', homepage: null, topics: [], license: { spdx: 'MIT', name: 'MIT License' }, archived: false, fork: false,
    isTemplate: false, pushedAt: '2026-10-20T00:00:00Z', createdAt: '2025-01-01T00:00:00Z', stars: 12, forks: 1, ownerAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
    language: 'TypeScript', readme: null, release: null, ...over,
  };
}
function cand(g: GithubData): Candidate {
  return { connector: 'github', externalId: g.fullName.toLowerCase(), sourceUrl: `https://github.com/${g.fullName}`, retrievedAt: NOW.toISOString(), name: g.fullName.split('/')[1], description: g.description, homepage: g.homepage, github: g };
}

const README_APP = `# Sample App

Sample App is a desktop application that lets you chat with local LLMs through Ollama on your own computer.

## Features
- Chat with local models without sending data to the cloud
- Drag and drop PDF documents to ask questions about them
- Works offline once models are downloaded

## Installation
### Windows
Download the installer from the releases page.
### macOS
Download the dmg from the releases page.

\`\`\`bash
npm install -g sample-app
\`\`\`
`;

describe('evidencia de IA', () => {
  it('detecta términos fuertes y rechaza textos sin IA', () => {
    expect(aiEvidence(['Chat with local LLMs using Ollama']).value).toBe(true);
    expect(aiEvidence(['A fast todo list for your terminal']).value).toBe(false);
    // "agent" solo no basta
    expect(aiEvidence(['Real estate agent website']).value).toBe(false);
  });
  it('una mención aislada de IA en el README no basta', () => {
    expect(aiEvidence(['Find secrets in git repositories'], ['You can also use an LLM to triage results.']).value).toBe(false);
    expect(aiEvidence(['Note taking app'], ['Uses an LLM via Ollama with RAG embeddings and Whisper transcription']).value).toBe(true);
  });
});

describe('clasificación de categorías', () => {
  it('asigna categorías con evidencia en la descripción', () => {
    const r = classifyCategories(['Transcribe audio with Whisper speech-to-text'], []);
    expect(r.value).toContain('voice-transcription');
  });
  it('permite varias categorías (máx. 3)', () => {
    const r = classifyCategories(['AI coding assistant for VS Code that generates unit tests and React landing page components'], []);
    expect(r.value.length).toBeGreaterThan(1);
    expect(r.value.length).toBeLessThanOrEqual(3);
    expect(r.value).toContain('programming');
  });
  it('el README solo no basta para asignar una categoría', () => {
    const r = classifyCategories(['A neat desktop app'], ['seo seo keyword research serp backlink']);
    expect(r.value).toEqual(['other']);
  });
  it('usa "other" si no hay evidencia', () => {
    expect(classifyCategories(['Something generic'], []).value).toEqual(['other']);
  });
});

describe('plataformas con evidencia', () => {
  it('detecta plataformas por binarios de release', () => {
    const c = cand(gh({ release: { tag: 'v1.0.0', publishedAt: '2026-10-01', url: 'https://github.com/example/sample-app/releases/tag/v1.0.0', assets: ['app-setup.exe', 'app.dmg', 'app.AppImage', 'app.apk'] } }));
    expect(detectPlatforms(c, '').value.sort()).toEqual(['android', 'linux', 'macos', 'windows']);
  });
  it('detecta tiendas y extensiones por enlaces', () => {
    const c = cand(gh());
    const readme = 'Get it on https://play.google.com/store/apps/details?id=x and https://chromewebstore.google.com/detail/abc';
    expect(detectPlatforms(c, readme).value.sort()).toEqual(['android', 'browser-extension']);
  });
  it('no asume plataformas sin evidencia', () => {
    expect(detectPlatforms(cand(gh({ description: 'An AI tool' })), 'Nothing about operating systems here.').value).toEqual([]);
  });
  it('acepta secciones dedicadas del README', () => {
    expect(detectPlatforms(cand(gh()), README_APP).value).toEqual(expect.arrayContaining(['windows', 'macos']));
  });
});

describe('precio, licencia y modo sin conexión', () => {
  it('open source sin planes de pago → gratuita; sin evidencia → no verificada', () => {
    const c = cand(gh());
    expect(detectPricing(c, { openSource: true }, 'Free and open source').value).toBe('free');
    expect(detectPricing(c, { openSource: true }, 'Pro plan $10 per month').value).toBe('unverified');
    expect(detectPricing({ ...c, github: undefined, connector: 'curated' }, { openSource: null }, '').value).toBe('unverified');
  });
  it('página de precios con plan gratuito y de pago → freemium', () => {
    const c: Candidate = { ...cand(gh()), github: undefined, connector: 'curated', pricingPage: { status: 200, url: 'https://x.example.org/pricing', text: 'Free plan for everyone. Pro $20 per month billed monthly.' } };
    expect(detectPricing(c, { openSource: null }, '').value).toBe('freemium');
  });
  it('licencia sin SPDX → desconocida', () => {
    expect(licenseInfo(null, null).openSource).toBeNull();
    expect(licenseInfo('MIT', 'MIT License').openSource).toBe(true);
    expect(licenseInfo('CC-BY-NC-4.0', null).openSource).toBeNull();
  });
  it('sin conexión solo con frase explícita', () => {
    expect(detectOffline('Works offline once models are downloaded').value).toBe(true);
    expect(detectOffline('Requires an internet connection').value).toBeNull();
  });
  it('extrae funciones del README', () => {
    expect(extractSection(README_APP, FEATURES_HEADING)).toHaveLength(3);
  });
});

describe('exclusión de contenido que no es herramienta', () => {
  it('rechaza listas awesome, datasets, prompts y papers', () => {
    for (const [name, desc, topics] of [
      ['example/awesome-ai-tools', 'A curated list of AI tools', ['awesome']],
      ['example/llm-dataset', 'Dataset for training LLMs', ['dataset']],
      ['example/chatgpt-prompts', 'Collection of prompts for ChatGPT', []],
      ['example/paper-code', 'Official implementation of the paper on diffusion models', []],
    ] as const) {
      const r = processCandidate(cand(gh({ fullName: name, description: desc, topics: [...topics], readme: 'x'.repeat(300) })), NOW);
      expect(r.status, name).toBe('rejected');
    }
  });
  it('rechaza bibliotecas sin señales de aplicación', () => {
    const r = processCandidate(cand(gh({ fullName: 'example/llm-sdk', description: 'Python library for calling LLM APIs. A wrapper for OpenAI.', readme: 'pip install llm-sdk\n'.repeat(30) })), NOW);
    expect(applicationEvidence(cand(gh({ description: 'Python library for calling LLM APIs' })), 'Python library for calling LLM APIs').library).toBe(true);
    expect(r.status).toBe('rejected');
  });
  it('rechaza repos archivados', () => {
    const r = processCandidate(cand(gh({ description: 'Desktop app to chat with local LLMs using Ollama', archived: true, readme: README_APP })), NOW);
    expect(r.status).toBe('rejected');
    expect(r.reasons.join(' ')).toContain('notArchived');
  });
  it('publica una aplicación real con evidencia completa', () => {
    const r = processCandidate(cand(gh({ description: 'Desktop app to chat with local LLMs using Ollama, fully private', topics: ['llm', 'desktop-app', 'ollama'], readme: README_APP })), NOW);
    expect(r.reasons.filter((x) => !x.startsWith('AVISO'))).toEqual([]);
    expect(r.status).toBe('published');
    expect(r.draft.license.openSource).toBe(true);
    expect(r.draft.localExecution).toBe(true);
    expect(r.draft.offline).toBe(true);
    expect(r.draft.features.original.length).toBe(3);
    expect(r.draft.logo?.origin).toBe('github-avatar');
  });
  it('manda a revisión si falta información crítica (sin plataformas)', () => {
    const r = processCandidate(cand(gh({ description: 'An AI assistant that summarizes your notes with GPT models', readme: '# Notes\n\nAn AI assistant app.\n\n## Install\n\n```bash\nnpm install notes\n```\n' + 'More text here. '.repeat(20) })), NOW);
    expect(r.status).toBe('review');
    expect(r.reasons.join(' ')).toContain('platformEvidence');
  });
  it('manda a revisión proyectos inactivos', () => {
    const r = processCandidate(cand(gh({ description: 'Desktop app to chat with local LLMs using Ollama', pushedAt: '2023-01-01T00:00:00Z', readme: README_APP })), NOW);
    expect(r.status).toBe('review');
  });
});
