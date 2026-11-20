import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function preloadErpEntry(): Plugin {
  return {
    name: 'preload-erp-entry',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        const app = Object.values(bundle).find(
          chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith('/src/App.tsx'),
        );
        if (index?.type !== 'asset' || typeof index.source !== 'string' || app?.type !== 'chunk') {
          this.error('Could not find the ERP entry and its HTML in the Vite build');
        }

        const html = index.source;
        // The two routes share the React entry. Only the ERP needs these modules.
        this.emitFile({ type: 'asset', fileName: 'menu/index.html', source: html });

        const tags: string[] = [];
        const visited = new Set<string>();
        const add = (file: string, rel: string) => {
          if (visited.has(file)) return false;
          visited.add(file);
          const href = `/${file}`;
          if (!html.includes(`"${href}"`)) {
            tags.push(`    <link rel="${rel}" crossorigin href="${href}">`);
          }
          return true;
        };
        const preload = (file: string) => {
          const chunk = bundle[file];
          if (chunk?.type !== 'chunk' || !add(file, 'modulepreload')) return;
          chunk.imports.forEach(preload);
          chunk.viteMetadata?.importedCss.forEach(css => add(css, 'stylesheet'));
        };
        preload(app.fileName);
        index.source = html.replace('  </head>', `${tags.join('\n')}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_AGOUZ_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_AGOUZ_RELEASE ?? ''),
    'import.meta.env.VITE_AGOUZ_ENVIRONMENT': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  plugins: [react(), preloadErpEntry()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {'/api': 'http://127.0.0.1:8093'},
  }
});
