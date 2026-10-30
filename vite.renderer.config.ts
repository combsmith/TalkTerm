import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  server: {
    watch: {
      ignored: ['**/node_modules/**', '**/_bmad/**', '**/_bmad-output/**', '**/test/**'],
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    exclude: [
      'vitest',
      '@testing-library/react',
      '@testing-library/user-event',
      '@testing-library/jest-dom',
    ],
  },
});
