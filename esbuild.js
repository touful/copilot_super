const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const promptsDir = path.join(__dirname, 'prompts');
const embeddedPrefixTxt = fs.readFileSync(path.join(promptsDir, 'prefix.txt'), 'utf8');
const embeddedCopilotTemplate = fs.readFileSync(path.join(promptsDir, 'copilot-template.md'), 'utf8');
const embeddedRuleTemplates = fs.readFileSync(path.join(promptsDir, 'rule-templates.json'), 'utf8');
const embeddedWorkflowTemplates = fs.readFileSync(path.join(promptsDir, 'workflow-templates.json'), 'utf8');

/** @type {import('esbuild').BuildOptions[]} */
const buildTargets = [
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    define: {
      __EMBEDDED_PREFIX_TXT__: JSON.stringify(embeddedPrefixTxt),
      __EMBEDDED_COPILOT_TEMPLATE_MD__: JSON.stringify(embeddedCopilotTemplate),
      __EMBEDDED_RULE_TEMPLATES_JSON__: JSON.stringify(embeddedRuleTemplates),
      __EMBEDDED_WORKFLOW_TEMPLATES_JSON__: JSON.stringify(embeddedWorkflowTemplates),
    },
    logLevel: 'info',
    metafile: true,
  },
  {
    entryPoints: ['src/webview/sidebarWebviewApp.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    target: 'es2022',
    outfile: 'dist/webview/sidebarWebviewApp.js',
    logLevel: 'info',
    metafile: true,
  },
];

async function main() {
  if (watch) {
    const contexts = await Promise.all(buildTargets.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[esbuild] Watching for changes...');
  } else {
    const results = await Promise.all(buildTargets.map((options) => esbuild.build(options)));
    for (const result of results) {
      if (result.metafile) {
        const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
        console.log(text);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
