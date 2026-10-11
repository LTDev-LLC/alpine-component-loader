import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run real plugin integrations against isolated historical installations
const run = (command, args, env = {}) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            env: {
                ...process.env,
                ...env,
            },
        });
        child.once('error', reject);
        child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
    });

const versions = process.env.ACL_VITE_VERSIONS?.split(',') || ['5.0.0', '6.0.0', '7.0.0', '8.0.0', 'development'];
// Keep historical tooling separate from the published package and dependency audit
for (const version of versions) {
    const directory = version === 'development' ? null : await mkdtemp(join(tmpdir(), 'acl-vite-matrix-'));
    // Remove each isolated installation after its integration assertions complete
    try {
        if (directory)
            await run('npm', [
                'install',
                '--prefix',
                directory,
                '--no-audit',
                '--no-fund',
                '--package-lock=false',
                `vite@${version}`,
            ]);
        process.stdout.write(`\nTesting Vite ${version}\n`);
        await run(process.execPath, ['--test', '--test-name-pattern=Vite', 'tests/unit/runtime-expansion.test.js'], {
            ACL_VITE_PACKAGE: directory
                ? pathToFileURL(join(directory, 'node_modules/vite/dist/node/index.js')).href
                : 'vite',
        });
        await run(
            process.execPath,
            [
                'node_modules/@playwright/test/cli.js',
                'test',
                'tests/vite-starter.spec.js',
                '--project=chromium',
                '--workers=1',
            ],
            {
                ACL_VITE_PACKAGE: directory
                    ? pathToFileURL(join(directory, 'node_modules/vite/dist/node/index.js')).href
                    : 'vite',
            },
        );
    } finally {
        if (directory)
            await rm(directory, {
                recursive: true,
                force: true,
            });
    }
}
