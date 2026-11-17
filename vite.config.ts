import { defineConfig } from 'vite';

// Chemins relatifs : le site fonctionne aussi bien à la racine qu'à l'adresse d'un projet GitHub Pages
// (https://<compte>.github.io/3D-DC/).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
