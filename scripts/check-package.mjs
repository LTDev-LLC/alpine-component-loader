import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Inspect the exact npm package manifest without creating an archive on disk
const run = promisify(execFile),
    { stdout } = await run('npm', ['pack', '--dry-run', '--json'], { maxBuffer: 10 * 1024 * 1024 }),
    report = JSON.parse(stdout)[0],
    paths = report.files.map(
        // Transform the current item
        (file) => file.path,
    ),
    forbidden = paths.filter(
        // Select matching items
        (path) =>
            path.startsWith('src/') ||
            path.startsWith('tests/') ||
            path.startsWith('scripts/') ||
            path.startsWith('components/') ||
            path.endsWith('.min.js') ||
            [
                'dist/AlpineComponentLoader.js',
                'dist/ACLDebugger.js',
                'dist/runtime/component-data-controller.js',
                'dist/runtime/component-factory.js',
                'dist/runtime/component-lifecycle-controller.js',
                'dist/runtime/component-loading-controller.js',
                'dist/runtime/component-render-controller.js',
                'dist/runtime/component-state-controller.js',
            ].includes(path) ||
            path.endsWith('.map') ||
            path === 'index.html',
    ),
    required = [
        'bin/alpine-component-loader.mjs',
        'dist/index.js',
        'dist/acl-load-error.js',
        'dist/auto.js',
        'dist/dev.js',
        'dist/debugger.js',
        'dist/offline.js',
        'dist/a11y.js',
        'dist/a11y-scanner.js',
        'dist/observability-exporters.js',
        'dist/testing.js',
        'dist/runtime/loader.js',
        'dist/runtime/manifest-loader.js',
        'dist/runtime/component/form-controller.js',
        'dist/elements/boundary.js',
        'dist/runtime/component/data-controller.js',
        'dist/runtime/component/data-gate-controller.js',
        'dist/runtime/component/factory.js',
        'dist/runtime/component/lifecycle-controller.js',
        'dist/runtime/component/loading-controller.js',
        'dist/runtime/component/render-controller.js',
        'dist/runtime/component/state-controller.js',
        'dist/runtime/overlay-utils.js',
        'dist/runtime/debugger-panel.js',
        'dist/runtime/a11y-scanner-dialog.js',
        'server/dev-server.mjs',
        'server/contract-generator.mjs',
        'server/project-config.mjs',
        'server/route-generator.mjs',
        'server/watch-coordinator.mjs',
        'server/vite-plugin.mjs',
        'server/ssr.mjs',
        'server/skeleton-generator.mjs',
        'types/index.d.ts',
        'types/auto.d.ts',
        'types/debugger.d.ts',
        'types/offline.d.ts',
        'types/a11y.d.ts',
        'types/a11y-scanner.d.ts',
        'types/dev.d.ts',
        'types/testing.d.ts',
        'types/ssr.d.ts',
        'types/project.d.ts',
        'types/vite.d.ts',
        'types/vite-routes.d.ts',
        'types/observability-exporters.d.ts',
        'docs/components.md',
        'docs/data.md',
        'docs/lifecycle.md',
        'docs/security.md',
        'docs/ssr.md',
        'docs/testing.md',
        'docs/observability.md',
        'docs/prefetch.md',
        'docs/manifests-and-cli.md',
        'docs/offline.md',
        'docs/accessibility-and-debugging.md',
        'docs/api.md',
        'README.md',
        'MIGRATION.md',
        'LICENSE',
    ],
    missing = required.filter(
        // Select matching items
        (path) => !paths.includes(path),
    );

// Reject internal files and require every documented public package artifact
if (forbidden.length || missing.length) {
    if (forbidden.length) process.stderr.write(`Forbidden package files:\n${forbidden.join('\n')}\n`);
    if (missing.length) process.stderr.write(`Missing package files:\n${missing.join('\n')}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Package contract passed (${report.entryCount} files, ${report.unpackedSize} unpacked bytes).\n`,
    );
}
