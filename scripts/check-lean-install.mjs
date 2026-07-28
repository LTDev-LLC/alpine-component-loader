import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile),
    packageRoot = resolve('.'),
    temporaryRoot = await mkdtemp(join(tmpdir(), 'acl-lean-install-')),
    packageDirectory = join(temporaryRoot, 'package'),
    applicationRoot = join(temporaryRoot, 'application');

await Promise.all([mkdir(packageDirectory), mkdir(applicationRoot)]);
await Promise.all([
    writeFile(join(packageDirectory, 'package.json'), '{"private":true,"type":"module"}\n'),
    writeFile(join(applicationRoot, 'index.html'), '<!doctype html><script type="module" src="/app.js"></script>\n'),
    writeFile(join(applicationRoot, 'app.js'), 'export const ready = true;\n'),
]);

const packed = JSON.parse(
        (
            await execute('npm', ['pack', '--json', '--pack-destination', temporaryRoot], {
                cwd: packageRoot,
            })
        ).stdout,
    ),
    tarball = join(temporaryRoot, packed[0].filename);
await execute(
    'npm',
    ['install', tarball, '--omit=optional', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'],
    { cwd: packageDirectory },
);

const packagePath = join(packageDirectory, 'node_modules/alpine-component-loader'),
    cliPath = join(packagePath, 'bin/alpine-component-loader.mjs');
await execute(process.execPath, ['--input-type=module', '--eval', "await import('alpine-component-loader')"], {
    cwd: packageDirectory,
});
const help = await execute(process.execPath, [cliPath, '--help'], { cwd: packageDirectory });
if (!help.stdout.includes('Usage:')) throw new Error('Lean-install CLI help did not render.');
await execute(process.execPath, [cliPath, 'create', join(temporaryRoot, 'starter'), '--dry-run'], {
    cwd: packageDirectory,
});

const serverProbe = `
import { startACLDevServer } from ${JSON.stringify(pathToFileURL(join(packagePath, 'server/dev-server.mjs')).href)};
const app = await startACLDevServer({ root: ${JSON.stringify(applicationRoot)}, index: 'index.html', port: 0, watchFiles: false });
try {
  const readable = await fetch(new URL('/app.js', app.origin));
  if (!readable.ok || !(await readable.text()).includes('ready')) throw new Error('Readable JavaScript serving failed.');
  const generated = await fetch(new URL('/app.min.js', app.origin));
  const message = await generated.text();
  if (generated.status !== 500 || !message.includes('@swc/core') || !message.includes('--omit=optional'))
    throw new Error('Missing SWC guidance was not actionable.');
} finally {
  await app.close();
}
`;
await execute(process.execPath, ['--input-type=module', '--eval', serverProbe], { cwd: packageDirectory });

/** @type {(Error & { stderr?: string | Buffer }) | undefined} */
let parserFailure;
// Capture the expected parser-backed command failure from the lean install
try {
    await execute(process.execPath, [cliPath, 'manifest', applicationRoot, '--dry-run'], {
        cwd: packageDirectory,
    });
} catch (error) {
    parserFailure = /** @type {Error & { stderr?: string | Buffer }} */ (error);
}
if (
    !parserFailure ||
    !String(parserFailure.stderr).includes('parse5') ||
    !String(parserFailure.stderr).includes('--omit=optional')
)
    throw new Error('Lean-install parser guidance was not actionable.');

const installedPackage = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'));
if (installedPackage.version !== '1.0.0') throw new Error(`Unexpected packed version: ${installedPackage.version}`);
process.stdout.write('Lean optional-dependency installation smoke test passed.\n');
