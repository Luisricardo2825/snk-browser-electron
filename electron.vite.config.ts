import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import svgr from 'vite-plugin-svgr';
import { dependencies as nativeDependencies } from './release/app/package.json';

const root = __dirname;
const nativeModules = Object.keys(nativeDependencies || {});
// Use an array so electron-vite can merge these with its builtin externals.
const external = nativeModules.flatMap((name) => [
  name,
  new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
]);

const resolve = {
  alias: {
    '@': path.join(root, 'src/renderer'),
    '@main': path.join(root, 'src/main'),
    '@shared': path.join(root, 'src/shared'),
  },
};
export default defineConfig({
  main: {
    resolve: resolve,
    build: {
      outDir: 'release/app/dist/main',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/main.ts'),
        external,
        output: { entryFileNames: 'main.js' },
      },
    },
  },
  preload: {
    resolve: resolve,
    build: {
      outDir: 'release/app/dist/preload',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/preload.ts'),
        external,
        output: { entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    resolve: resolve,
    root: path.join(root, 'src/renderer'),
    base: './',
    plugins: [react({}), svgr(), tailwindcss()],
    server: {
      host: 'localhost',
      port: Number(process.env.PORT || 1212),
      strictPort: true,
    },
    build: {
      outDir: path.join(root, 'release/app/dist/renderer'),
      emptyOutDir: true,
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        input: path.join(root, 'src/renderer/index.html'),
        output: { entryFileNames: 'renderer.js' },
      },
    },
  },
});
