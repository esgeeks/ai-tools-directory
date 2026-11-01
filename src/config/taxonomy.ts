/**
 * Taxonomía: categorías, plataformas y modalidades de precio.
 * Las palabras clave alimentan al clasificador del pipeline (pipeline/classify.ts):
 * una categoría solo se asigna si el texto de la fuente contiene evidencia.
 */

export interface CategoryDef {
  id: string;
  slug: { es: string; en: string };
  label: { es: string; en: string };
  icon: string;
  /** Expresiones (minúsculas, se buscan como palabras completas) que respaldan la categoría. */
  keywords: string[];
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'assistants', slug: { es: 'asistentes-de-ia', en: 'ai-assistants' }, label: { es: 'Asistentes de IA', en: 'AI assistants' }, icon: 'chat',
    keywords: ['chatbot', 'chat bot', 'ai assistant', 'personal assistant', 'virtual assistant', 'chat with', 'chat ui', 'chat interface', 'chatgpt client', 'llm chat', 'conversational ai', 'copilot', 'asistente'] },
  { id: 'productivity', slug: { es: 'productividad', en: 'productivity' }, label: { es: 'Productividad', en: 'Productivity' }, icon: 'check',
    keywords: ['productivity', 'note-taking', 'note taking', 'notes app', 'second brain', 'knowledge base', 'meeting notes', 'task management', 'calendar', 'email assistant', 'summarize', 'summarization', 'summary', 'pdf reader', 'chat with pdf', 'chat with documents', 'productividad'] },
  { id: 'programming', slug: { es: 'programacion', en: 'programming' }, label: { es: 'Programación', en: 'Programming' }, icon: 'code',
    keywords: ['code completion', 'coding assistant', 'code assistant', 'code review', 'code generation', 'ai coding', 'pair programmer', 'pair programming', 'developer tool', 'devtool', 'vscode', 'vs code', 'neovim', 'jetbrains', 'refactor', 'unit tests', 'commit message', 'pull request', 'coding agent', 'software engineer agent', 'programación'] },
  { id: 'graphic-design', slug: { es: 'diseno-grafico', en: 'graphic-design' }, label: { es: 'Diseño gráfico', en: 'Graphic design' }, icon: 'palette',
    keywords: ['graphic design', 'logo generator', 'logo design', 'ui design', 'design tool', 'mockup', 'vector', 'svg generation', 'figma', 'poster', 'illustration', 'diseño'] },
  { id: 'image-generation', slug: { es: 'generacion-de-imagenes', en: 'image-generation' }, label: { es: 'Generación de imágenes', en: 'Image generation' }, icon: 'image',
    keywords: ['text-to-image', 'text to image', 'image generation', 'image generator', 'generate images', 'stable diffusion', 'sdxl', 'flux', 'diffusion model', 'midjourney', 'dall-e', 'dalle', 'comfyui', 'controlnet', 'lora training'] },
  { id: 'photo-editing', slug: { es: 'edicion-de-fotografias', en: 'photo-editing' }, label: { es: 'Edición de fotografías', en: 'Photo editing' }, icon: 'camera',
    keywords: ['photo editing', 'photo editor', 'image editing', 'image editor', 'background removal', 'remove background', 'background remover', 'upscale', 'upscaler', 'upscaling', 'super resolution', 'inpainting', 'outpainting', 'face restoration', 'colorize', 'retouch', 'object removal'] },
  { id: 'video-generation', slug: { es: 'generacion-de-video', en: 'video-generation' }, label: { es: 'Generación de vídeo', en: 'Video generation' }, icon: 'video',
    keywords: ['text-to-video', 'text to video', 'image-to-video', 'image to video', 'video generation', 'video generator', 'generate videos', 'ai video', 'avatar video', 'talking head', 'lip sync', 'lipsync', 'animation generation'] },
  { id: 'video-editing', slug: { es: 'edicion-de-video', en: 'video-editing' }, label: { es: 'Edición de vídeo', en: 'Video editing' }, icon: 'film',
    keywords: ['video editing', 'video editor', 'subtitles', 'subtitle', 'captions', 'auto captions', 'video upscaling', 'video enhance', 'frame interpolation', 'shorts', 'reels', 'dubbing'] },
  { id: 'audio-music', slug: { es: 'audio-y-musica', en: 'audio-music' }, label: { es: 'Audio y música', en: 'Audio & music' }, icon: 'music',
    keywords: ['music generation', 'music generator', 'generate music', 'song', 'audio generation', 'sound effects', 'stem separation', 'source separation', 'vocal remover', 'audio editing', 'audio enhancement', 'noise reduction', 'noise suppression', 'mastering', 'música'] },
  { id: 'voice-transcription', slug: { es: 'voz-y-transcripcion', en: 'voice-transcription' }, label: { es: 'Voz y transcripción', en: 'Voice & transcription' }, icon: 'mic',
    keywords: ['speech-to-text', 'speech to text', 'transcription', 'transcribe', 'transcriber', 'whisper', 'asr', 'speech recognition', 'text-to-speech', 'text to speech', 'tts', 'voice cloning', 'voice clone', 'voice changer', 'voice conversion', 'dictation', 'transcripción'] },
  { id: 'writing', slug: { es: 'escritura', en: 'writing' }, label: { es: 'Escritura', en: 'Writing' }, icon: 'pen',
    keywords: ['writing assistant', 'ai writer', 'copywriting', 'grammar', 'rewrite', 'paraphrase', 'paraphrasing', 'proofreading', 'essay', 'blog post', 'story writing', 'novel', 'translation', 'translator', 'translate', 'escritura'] },
  { id: 'marketing', slug: { es: 'marketing', en: 'marketing' }, label: { es: 'Marketing', en: 'Marketing' }, icon: 'megaphone',
    keywords: ['marketing', 'social media', 'ad copy', 'advertising', 'campaign', 'newsletter', 'email marketing', 'influencer'] },
  { id: 'seo', slug: { es: 'seo', en: 'seo' }, label: { es: 'SEO', en: 'SEO' }, icon: 'trend',
    keywords: ['seo', 'search engine optimization', 'keyword research', 'serp', 'backlink', 'meta description', 'content optimization'] },
  { id: 'research', slug: { es: 'investigacion', en: 'research' }, label: { es: 'Investigación', en: 'Research' }, icon: 'search',
    keywords: ['research assistant', 'deep research', 'literature review', 'academic papers', 'scientific papers', 'arxiv', 'citations', 'search engine', 'answer engine', 'web search', 'perplexity', 'rag', 'retrieval-augmented', 'investigación'] },
  { id: 'education', slug: { es: 'educacion', en: 'education' }, label: { es: 'Educación', en: 'Education' }, icon: 'book',
    keywords: ['education', 'learning', 'tutor', 'tutoring', 'students', 'teacher', 'flashcards', 'quiz', 'language learning', 'educación'] },
  { id: 'automation', slug: { es: 'automatizacion', en: 'automation' }, label: { es: 'Automatización', en: 'Automation' }, icon: 'bolt',
    keywords: ['automation', 'automate', 'workflow', 'workflows', 'ai agent', 'ai agents', 'autonomous agent', 'agentic', 'browser automation', 'rpa', 'no-code', 'low-code', 'zapier', 'n8n', 'automatización'] },
  { id: 'business', slug: { es: 'negocios', en: 'business' }, label: { es: 'Negocios', en: 'Business' }, icon: 'briefcase',
    keywords: ['business', 'crm', 'sales', 'customer support', 'customer service', 'helpdesk', 'invoice', 'accounting', 'finance', 'recruiting', 'legal', 'contract', 'presentation', 'slides', 'spreadsheet', 'negocios'] },
  { id: 'data-analysis', slug: { es: 'analisis-de-datos', en: 'data-analysis' }, label: { es: 'Análisis de datos', en: 'Data analysis' }, icon: 'chart',
    keywords: ['data analysis', 'data analytics', 'analytics', 'text-to-sql', 'text to sql', 'sql', 'dashboard', 'business intelligence', 'data visualization', 'charts', 'spreadsheet', 'pandas', 'csv', 'excel'] },
  { id: 'cybersecurity', slug: { es: 'ciberseguridad', en: 'cybersecurity' }, label: { es: 'Ciberseguridad', en: 'Cybersecurity' }, icon: 'shield',
    keywords: ['security', 'cybersecurity', 'pentest', 'pentesting', 'penetration testing', 'vulnerability', 'vulnerabilities', 'malware', 'threat', 'osint', 'red team', 'blue team', 'siem', 'phishing', 'fuzzing', 'ciberseguridad'] },
  { id: 'web-development', slug: { es: 'desarrollo-web', en: 'web-development' }, label: { es: 'Desarrollo web', en: 'Web development' }, icon: 'globe',
    keywords: ['web development', 'website builder', 'web app builder', 'landing page', 'frontend', 'front-end', 'react', 'nextjs', 'next.js', 'tailwind', 'html', 'css', 'ui generation', 'screenshot to code', 'design to code', 'full-stack', 'fullstack'] },
  { id: 'local-ai', slug: { es: 'herramientas-locales-de-ia', en: 'local-ai-tools' }, label: { es: 'Herramientas locales de IA', en: 'Local AI tools' }, icon: 'chip',
    keywords: ['run locally', 'runs locally', 'local llm', 'local llms', 'local ai', 'locally', 'on-device', 'on device', 'offline', 'self-hosted', 'self hosted', 'selfhosted', 'ollama', 'llama.cpp', 'gguf', 'privacy-first', 'private ai', 'local-first'] },
  { id: 'other', slug: { es: 'otras-herramientas', en: 'other-tools' }, label: { es: 'Otras herramientas', en: 'Other tools' }, icon: 'grid',
    keywords: [] },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

export const PLATFORMS = [
  { id: 'web', label: { es: 'Web', en: 'Web' } },
  { id: 'windows', label: { es: 'Windows', en: 'Windows' } },
  { id: 'macos', label: { es: 'macOS', en: 'macOS' } },
  { id: 'linux', label: { es: 'Linux', en: 'Linux' } },
  { id: 'android', label: { es: 'Android', en: 'Android' } },
  { id: 'ios', label: { es: 'iOS', en: 'iOS' } },
  { id: 'browser-extension', label: { es: 'Extensión de navegador', en: 'Browser extension' } },
  { id: 'cli', label: { es: 'Terminal / CLI', en: 'Terminal / CLI' } },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]['id'];
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as PlatformId[];

export const PRICING = [
  { id: 'free', label: { es: 'Gratuita', en: 'Free' } },
  { id: 'freemium', label: { es: 'Freemium', en: 'Freemium' } },
  { id: 'paid', label: { es: 'De pago', en: 'Paid' } },
  { id: 'unverified', label: { es: 'No verificada', en: 'Unverified' } },
] as const;
export type PricingId = (typeof PRICING)[number]['id'];
export const PRICING_IDS = PRICING.map((p) => p.id) as PricingId[];
