import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateOfflineBundle } from '../server/offline-generator.mjs';
import { alpineRuntime } from './alpine-runtime.mjs';
import { prepareAlpineRuntime } from './prepare-alpine-runtime.mjs';

// Generate either worker from one dependency policy and the configured Alpine pin
export const prepareOfflineVariant = async (root, { includeSkeletons = false, entry = 'core' } = {}) => {
    if (!['index', 'core'].includes(entry)) throw new TypeError(`Unsupported offline entry "${entry}".`);
    const directory = resolve(root, 'examples/offline'),
        core = entry === 'core',
        result = await generateOfflineBundle({
            manifestFile: resolve(directory, 'acl-manifest.json'),
            outDir: directory,
            groups: ['offline-demo'],
            assets: [
                'index.html',
                'demo.html',
                'app.min.js',
                'styles.css',
                'acl-manifest.json',
                '../feature-lab/demos',
                ...(includeSkeletons ? ['skeletons/acl-skeletons.css'] : []),
                alpineRuntime.cdnUrl,
            ],
            baseUrl: '/examples/offline',
            runtime: {
                entryUrl: `/dist/${entry}.min.js`,
                features: [
                    'offline',
                    'polyfills',
                    'data',
                    'hydration',
                    'triggers',
                    'styles',
                    'slots',
                    'scripts',
                    'environment',
                    'scheduler',
                ],
            },
            namespace: core ? 'example-core' : 'example',
            configFile: resolve(directory, 'acl-offline.json'),
            dryRun: true,
        });
    await writeFile(resolve(directory, core ? 'acl-sw-core.js' : 'acl-sw.js'), result.outputs.serviceWorker);
    await writeFile(
        resolve(directory, core ? 'acl-precache-core.json' : 'acl-precache-manifest.json'),
        result.outputs.manifest,
    );
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await prepareAlpineRuntime();
    await prepareOfflineVariant(resolve('.'), { entry: 'index' });
    await prepareOfflineVariant(resolve('.'));
    process.stdout.write(`Generated root/core offline workers with Alpine ${alpineRuntime.version}.\n`);
}
