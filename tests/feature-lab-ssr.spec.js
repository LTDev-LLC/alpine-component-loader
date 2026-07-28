import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

let processHandle, baseUrl;

test.beforeAll(async () => {
    // Prepare the test group
    processHandle = spawn(process.execPath, ['examples/feature-lab-ssr/server.mjs'], {
        cwd: resolve('.'),
        env: {
            ...process.env,
            PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    baseUrl = await new Promise((resolveUrl, reject) => {
        // Settle the asynchronous operation
        let output = '';
        const timeout = setTimeout(
            // Run the scheduled delayed task
            () => reject(new Error(`SSR feature lab did not start. ${output}`)),
            10_000,
        );
        processHandle.stdout.on('data', (chunk) => {
            // Handle the data event
            output += chunk;
            const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) {
                clearTimeout(timeout);
                resolveUrl(match[0]);
            }
        });
        processHandle.stderr.on('data', (chunk) => {
            // Handle the data event
            output += chunk;
        });
        processHandle.once('exit', (code) => {
            // Handle the exit event
            clearTimeout(timeout);
            reject(new Error(`SSR feature lab exited with ${code}. ${output}`));
        });
    });
});

test.afterAll(async () => {
    // Clean up the completed test group
    if (!processHandle || processHandle.exitCode != null) return;
    await new Promise((resolveExit) => {
        // Settle the asynchronous operation
        processHandle.once('exit', resolveExit);
        processHandle.kill('SIGTERM');
    });
});

test('SSR feature lab page shell lives in the external HTML template', async ({ request }) => {
    // Verify the server renders its external page template without exposing the source file
    const serverSource = await readFile(resolve('examples/feature-lab-ssr/server.mjs'), 'utf8'),
        templateSource = await readFile(resolve('examples/feature-lab-ssr/index.html.tmpl'), 'utf8'),
        response = await request.get(`${baseUrl}/index.html.tmpl`);
    expect(templateSource).toContain('<title>AlpineComponentLoader SSR Feature Lab</title>');
    expect(templateSource).toContain('{{HERO}}');
    expect(serverSource).not.toContain('<!DOCTYPE html>');
    expect(serverSource).not.toContain('<html');
    expect(response.status()).toBe(404);
});

test('SSR feature lab remains complete and meaningful without JavaScript', async ({ browser }) => {
    // Exercise the test scenario
    const context = await browser.newContext({ javaScriptEnabled: false }),
        page = await context.newPage();
    await page.goto(baseUrl);
    await expect(page.locator('#hydration-status')).toHaveText(
        'Server rendered · JavaScript has not hydrated this page',
    );
    await expect(page.locator('lab-hero').locator('h1')).toHaveText('Server-rendered Feature Lab');
    await expect(page.locator('lab-hero')).toContainText('This sentence and every component below remain meaningful');
    await expect(page.locator('#slot-projection')).toContainText('These consumer nodes stay in Light DOM');
    await expect(page.locator('#hydration-data')).toContainText(
        'Server fallback: the activity endpoint has not run yet.',
    );
    await expect(page.locator('#event-counter').locator('button')).toHaveText('Count 2');
    await expect(page.locator('#shadow-active')).toContainText('Status: Active');
    await expect(page.locator('#progress-primary')).toContainText('75%');
    await expect(page.locator('#lifecycle-card')).toContainText('waiting for the browser lifecycle');
    await expect(page.locator('#polling-card')).toContainText('polling starts after hydration');
    await expect(page.locator('#advanced-props')).toContainText('["typed","isolated"]');
    await expect(page.locator('#a11y-issues')).toContainText('Intentionally inaccessible profile card');
    await expect(page.locator('#security-probe').locator('script')).toHaveCount(0);
    await expect(page.locator('#security-probe').locator('#unsafe-link')).not.toHaveAttribute('href');
    await context.close();
});

test('SSR feature lab hydrates in place, fetches data, projects slots, and becomes interactive', async ({ page }) => {
    // Exercise the test scenario
    const templates = [],
        errors = [],
        packageRequests = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => errors.push(error.message),
    );
    page.on('request', (request) => {
        // Handle the request event
        const url = new URL(request.url());
        if (url.pathname.startsWith('/components/')) templates.push(request.url());
        if (url.pathname.startsWith('/dist/')) packageRequests.push(url.pathname);
    });
    const response = await page.goto(baseUrl);
    await expect(page.locator('html')).toHaveAttribute('data-acl-ready', 'true');
    await expect(page.locator('script[data-acl-hmr-client]')).toHaveCount(1);
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers()['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
    await expect(page.locator('#hydration-status')).toHaveText('Hydrated 22 components in place · no template fetches');
    await expect(page.locator('#hydrated-count')).toHaveText('22');
    await expect(page.locator('#template-request-count')).toHaveText('0');
    await expect(page.locator('#registered-count')).toHaveText('17');
    await expect(page.locator('#feature-count')).toHaveText('9');
    expect(templates).toEqual([]);
    expect(packageRequests.length).toBeGreaterThan(8);
    expect(
        packageRequests.every(
            // Keep optional entries and hydration runtime descendants in the minified family
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);

    const hero = page.locator('lab-hero');
    await hero.locator('button').click();
    await expect(hero.locator('button')).toHaveText('Hydrated clicks: 1');
    expect(
        await page
            .locator('#slot-projection')
            .locator('slot[name="badge"]')
            .evaluate(
                // Read the browser state
                (slot) => slot.assignedElements()[0]?.textContent,
            ),
    ).toContain('Projected by the parser');
    await expect(page.locator('#hydration-data')).toContainText(
        'Hydration fetch completed without replacing the server template.',
    );
    await expect(page.locator('#cache-control')).toContainText('Cache request 1');
    await expect(page.locator('#polling-card')).toContainText('Polling request 1');
    await expect(page.locator('#response-card')).toContainText('Decoded JSON response');

    await page.locator('#store-primary').getByRole('button', { name: 'Toggle shared store' }).click();
    await expect(page.locator('#store-primary')).toContainText('Store: Dark');
    await expect(page.locator('#store-secondary')).toContainText('Store: Dark');

    await page.locator('#mapped-event-card').getByRole('button', { name: 'Dispatch internal-save' }).click();
    await expect(page.locator('#event-output')).toHaveText('Received public-save from mapped event');

    await page.getByRole('button', { name: 'Set score property to 88' }).click();
    await expect(page.locator('#advanced-props')).toContainText('88% (attribute: 88)');

    const counter = page.locator('#event-counter');
    await counter.locator('button').click();
    await expect(counter.locator('button')).toHaveText('Count 3');
    await expect(page.locator('#event-output')).toContainText('"count":3');
    await expect(page.locator('#observability-output')).toContainText('hydrationend');
    await expect(page.locator('#security-probe').locator('script')).toHaveCount(0);
    await expect(page.locator('#security-probe').locator('#unsafe-link')).not.toHaveAttribute('onclick');
    const accessibility = await new AxeBuilder({ page }).exclude('#a11y-issues').exclude('#acl-debug-panel').analyze();
    expect(getSeriousAccessibilityViolations(accessibility)).toEqual([]);
    expect(errors).toEqual([]);
});

test('SSR feature lab exposes the debugger and accessibility scanner', async ({ page }) => {
    // Exercise both optional development overlays against hydrated SSR components
    await page.goto(baseUrl);
    await expect(page.locator('html')).toHaveAttribute('data-acl-ready', 'true');

    await page.locator('#section-debug-toggle').click();
    await expect(page.locator('#acl-debug-panel')).toBeVisible();
    await expect(page.locator('#acl-debug-panel')).toContainText('Live components');
    await expect(page.locator('#acl-debug-panel')).toContainText('<a11y-issues-demo>');
    await page.locator('#acl-debug-panel').getByRole('button', { name: 'Turn off debugging' }).click();
    await expect(page.locator('#acl-debug-panel')).toBeHidden();

    await page.locator('#section-a11y-toggle').click();
    await expect(page.locator('#acl-a11y-scanner-modal')).toBeVisible();
    await expect(page.locator('#acl-a11y-scanner-modal')).toContainText('<a11y-issues-demo>');
    await expect(page.locator('#acl-a11y-scanner-modal')).toContainText('image-alt');
    await page.locator('#acl-a11y-scanner-modal').getByRole('button', { name: 'Close accessibility scanner' }).click();
    await expect(page.locator('#acl-a11y-scanner-modal')).toBeHidden();

    await page.locator('#focused-a11y-audit').click();
    await expect(page.locator('#accessibility-output')).toContainText('image-alt');
    await expect(page.locator('#accessibility-output')).toContainText('form-label');
});

test('SSR feature lab isolates a revision mismatch to one safe client fallback', async ({ page }) => {
    // Exercise the test scenario
    const templates = [];
    page.on('request', (request) => {
        // Handle the request event
        if (request.url().includes('/components/')) templates.push(new URL(request.url()).pathname);
    });
    await page.goto(`${baseUrl}/?mismatch=1`);
    await expect(page.locator('html')).toHaveAttribute('data-acl-ready', 'true');
    await expect(page.locator('#hydration-status')).toHaveText(
        'Hydrated 21 components · recovered one revision mismatch',
    );
    await expect(page.locator('#fallback-mode')).toHaveText('revision mismatch recovered');
    await expect(page.locator('#template-request-count')).toHaveText('1');
    await expect(page.locator('#event-counter').locator('button')).toHaveText('Count 2');
    await expect(page.locator('#lab-hero')).toHaveAttribute('data-acl-hydrated', '');
    expect(templates).toEqual(['/components/lab-counter-card.html']);
});
