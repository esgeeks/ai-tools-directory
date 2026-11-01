// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { site } from './src/config/site.ts';

export default defineConfig({
  site: site.url,
  base: site.basePath,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss()] },
});
