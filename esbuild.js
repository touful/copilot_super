const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
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
  logLevel: 'info',
  metafile: true,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.metafile) {
      const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
      console.log(text);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
