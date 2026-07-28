import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

let processHandle, baseUrl;

test.beforeAll(async () => {
    // Prepare the test group
    processHandle = spawn(process.execPath, ['examples/ssr/server.mjs'], {
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
            () => reject(new Error(`SSR example did not start. ${output}`)),
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
            reject(new Error(`SSR example exited with ${code}. ${output}`));
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

test('SSR example keeps meaningful typed and slotted content without JavaScript', async ({ browser }) => {
    // Exercise the test scenario
    const context = await browser.newContext({ javaScriptEnabled: false }),
        page = await context.newPage();
    await page.goto(baseUrl);
    await expect(page.locator('profile-card')).toContainText('Rendered by Node');
    await expect(page.locator('profile-card')).toContainText('Count: 0');
    await expect(page.locator('profile-card')).toContainText('AL');
    await expect(page.locator('#hydration-status')).toHaveText('Server rendered; waiting for JavaScript');
    await context.close();
});

test('SSR example hydrates DSD with resolved data and skips template and initial data requests', async ({ page }) => {
    // Exercise the test scenario
    const templates = [],
        dataRequests = [],
        packageRequests = [];
    page.on('request', (request) => {
        // Handle the request event
        const url = new URL(request.url());
        if (url.pathname === '/components/profile-card.html') templates.push(request.url());
        if (url.pathname === '/api/profile') dataRequests.push(request.url());
        if (url.pathname.startsWith('/dist/')) packageRequests.push(url.pathname);
    });
    const response = await page.goto(baseUrl);
    await expect(page.locator('#hydration-status')).toHaveText('Hydrated in place');
    await expect(page.locator('script[data-acl-hmr-client]')).toHaveCount(1);
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers()['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
    const card = page.locator('profile-card');
    await expect(card.locator('h1')).toHaveText('Ada Lovelace');
    expect(
        await card.locator('.heading slot[name="avatar"]').evaluate(
            // Read the browser state
            (slot) => slot.assignedElements()[0]?.textContent,
        ),
    ).toBe('AL');
    expect(
        await card.locator('article > slot:not([name])').evaluate(
            // Read the browser state
            (slot) => slot.assignedElements()[0]?.textContent,
        ),
    ).toContain('Rendered by Node');
    await expect(card.locator('.heading p')).toHaveText('Profile data resolved safely by SSR for Ada Lovelace');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(getSeriousAccessibilityViolations(accessibility)).toEqual([]);
    expect(packageRequests.length).toBeGreaterThan(8);
    expect(
        packageRequests.every(
            // Keep hydration and its deferred runtime modules on minified URLs
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
    await card.locator('button').click();
    await expect(card.locator('button')).toHaveText('Count: 1');
    expect(templates).toEqual([]);
    expect(dataRequests).toEqual([]);
});

test('SSR example can defer hydration and use the explicit data policy renderer', async ({ page }) => {
    // Exercise the documented policy and interaction query controls together
    await page.goto(`${baseUrl}/?data=policy&hydrate=interaction`);
    const card = page.locator('profile-card');
    await expect(card).toHaveAttribute('data-acl-hydration-state', 'deferred');
    await expect(page.locator('#hydration-status')).toHaveText('Server rendered; waiting for JavaScript');
    await card.hover();
    await expect(card).toHaveAttribute('data-acl-hydration-state', 'hydrated');
    await expect(page.locator('#hydration-status')).toHaveText('Hydrated in place');
    await expect(card.locator('.heading p')).toHaveText('Profile data fetched under SSR dataPolicy for Ada Lovelace');
});

test('SSR example falls back safely after a revision mismatch', async ({ page }) => {
    // Exercise the test scenario
    const templates = [];
    page.on('request', (request) => {
        // Handle the request event
        if (request.url().includes('/components/profile-card.html')) templates.push(request.url());
    });
    await page.goto(`${baseUrl}/?mismatch=1`);
    await expect(page.locator('#hydration-status')).toHaveText('Client fallback after revision mismatch');
    await expect(page.locator('profile-card').locator('h1')).toHaveText('Ada Lovelace');
    expect(templates).toHaveLength(1);
});
