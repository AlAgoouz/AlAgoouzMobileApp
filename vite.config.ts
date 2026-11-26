import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

// Cache immutable build assets only. The worker never caches API responses or account pages.
const offlineBundle = (): Plugin => ({
  name: 'agouz-offline-bundle',
  apply: 'build',
  generateBundle(_options,bundle) {
    const assets = Object.keys(bundle).filter(path => /^assets\/.+\.(js|css|woff2|webp)$/.test(path)).sort().map(path => '/'+path);
    const prepared = new Set<string>();
    const follow = (file:string) => {
      const item=bundle[file];
      if(item?.type!=='chunk'||prepared.has(file))return;
      prepared.add(file);
      item.viteMetadata?.importedCss.forEach(css=>prepared.add(css));
      item.imports.forEach(follow);
    };
    for(const item of Object.values(bundle)){
      if(item.type==='chunk' && /\/(PurchaseScreen|WholesaleInvoiceScreen|ProductionAndRecipesScreen|StocktakingAndStaffScreens|ManagementScreens)\.tsx$/.test(item.facadeModuleId??''))
        follow(item.fileName);
    }
    const offlineScreens = assets.filter(path=>prepared.has(path.slice(1)));
    const template = readFileSync(new URL('./src/workers/offline.js', import.meta.url), 'utf8');
    const release = createHash('sha256').update(template).update(JSON.stringify(assets)).update(JSON.stringify(offlineScreens)).digest('hex').slice(0,16);
    this.emitFile({type:'asset', fileName:'sw.js', source:template
      .replace('__RELEASE__',release).replace('/* @offline-assets */ []',JSON.stringify(assets))
      .replace('/* @offline-screens */ []',JSON.stringify(offlineScreens))});
  },
});

export default defineConfig({
  define: {
    'import.meta.env.VITE_AGOUZ_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_AGOUZ_RELEASE ?? ''),
    'import.meta.env.VITE_AGOUZ_ENVIRONMENT': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  plugins: [react(), preloadErpEntry(), offlineBundle()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {'/api': 'http://127.0.0.1:8093'},
  }
});
