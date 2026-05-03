import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  integrations: [svelte()],
  output: 'static',
  vite: {
    css: {
      postcss: {
        plugins: [tailwindcss()]
      }
    }
  }
});
