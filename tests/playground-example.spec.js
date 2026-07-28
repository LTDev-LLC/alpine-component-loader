import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startACLDevServer } from '../server/dev-server.mjs';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let application;

test.beforeAll(async () => {
    // Start the checked-in example with access to built runtime assets
    application = await startACLDevServer({
        root: repositoryRoot,
        index: 'examples/playground/serve.html',
        port: 0,
        watchFiles: false,
    });
});

test.afterAll(async () => {
    // Release the local example server
    await application?.close();
});

test('playground tab clicks switch editors without scrolling or moving focus into source', async ({ page }) => {
    // Keep pointer activation on the tab while Alpine swaps the selected source panel
    await page.goto(`${application.origin}/examples/playground/index.html`);
    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
    const javascriptTab = page.getByRole('tab', {
        name: 'JavaScript',
    });
    await javascriptTab.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(
        // Capture the settled workbench position before pointer activation
        () => window.scrollY,
    );
    await javascriptTab.click();
    await expect(javascriptTab).toHaveAttribute('aria-selected', 'true');
    await expect(javascriptTab).toBeFocused();
    await expect(page.locator('#panel-javascript')).toBeVisible();
    await expect(page.locator('#editor-javascript')).not.toBeFocused();
    expect(
        await page.evaluate(
            // Ensure the newly exposed textarea did not move the document viewport
            () => window.scrollY,
        ),
    ).toBe(scrollBefore);
});

test('playground edits, reruns, diagnoses, persists, and resets a complete ACL page', async ({ page }) => {
    // Exercise the complete editor and preview workflow
    const failures = [],
        sandboxWarnings = [];
    page.on(
        'pageerror',
        // Record uncaught parent-page failures
        (error) => failures.push(`pageerror: ${error.message}`),
    );
    page.on('console', (message) => {
        // Record only parent or preview browser errors
        if (message.type() === 'error') failures.push(`console: ${message.text()}`);
        if (message.type() === 'warning' && message.text().includes('can escape its sandboxing'))
            sandboxWarnings.push(message.text());
    });

    await page.goto(`${application.origin}/examples/playground/index.html`);
    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
    await expect(page.locator('.lab-overview')).toHaveCount(0);
    expect(
        await page.locator('.workbench-section').evaluate(
            // Compare the workbench with the available page width
            (element) => element.getBoundingClientRect().width / document.documentElement.clientWidth,
        ),
    ).toBeGreaterThan(0.95);
    await expect(page.locator('acl-playground-app')).toHaveAttribute('data-acl-component', /ACL-PLAYGROUND-APP/i);
    await expect(page.locator('playground-workbench-controls')).toHaveAttribute(
        'data-acl-component',
        /PLAYGROUND-WORKBENCH-CONTROLS/i,
    );

    const preview = page.frameLocator('#preview');
    await expect(preview.locator('h1')).toHaveText('Good morning, Maya.');
    await expect(preview.locator('demo-dashboard')).toHaveAttribute('data-acl-component', /DEMO-DASHBOARD/i);
    await expect(preview.locator('demo-stat-card')).toHaveCount(4);
    await expect(preview.locator('demo-project-card')).toHaveCount(3);
    await expect(preview.locator('demo-activity-item')).toHaveCount(3);
    await expect(preview.locator('demo-profile-card').locator('strong')).toHaveText('Maya Chen');
    await expect(page.locator('[data-editor-tab]')).toHaveCount(4);
    await expect(page.locator('#metrics')).toContainText('"demo-stat-card"');
    await expect(page.locator('#editor-page')).toHaveValue(/^<demo-dashboard/);
    await expect(page.locator('#editor-page')).not.toHaveValue(/dashboard-shell/);
    const initialDocumentIdentity = await preview.locator('html').evaluate(() => {
        // Track the preview realm independently of authored page content
        window.__playgroundDocumentIdentity = crypto.randomUUID();
        return window.__playgroundDocumentIdentity;
    });

    // Drive the ACL bind-store theme component without rebuilding the preview
    const themeToggle = preview.getByRole('button', {
        name: 'Dark theme',
    });
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'false');
    const lightAccessibility = await new AxeBuilder({ page }).analyze();
    expect(getSeriousAccessibilityViolations(lightAccessibility)).toEqual([]);
    await page.getByRole('button', { name: 'Audit accessibility' }).click();
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#a11y-summary')).toContainText('0 findings');
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'false');
    await themeToggle.click();
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(preview.locator('.demo-app')).toHaveAttribute('data-theme', 'dark');
    await expect(preview.locator('#sample-status')).toHaveText('Dark theme enabled.');
    const darkAccessibility = await new AxeBuilder({ page }).analyze();
    expect(getSeriousAccessibilityViolations(darkAccessibility)).toEqual([]);

    // Exercise Alpine-generated collections and a composed task event
    await preview.getByRole('button', { name: 'View all' }).click();
    await expect(preview.locator('demo-project-card')).toHaveCount(4);
    await preview.getByRole('button', { name: 'Show priority' }).click();
    await expect(preview.locator('demo-project-card')).toHaveCount(3);
    await preview.getByRole('button', { name: 'Complete next task' }).click();
    await expect(preview.locator('#sample-status')).toHaveText('9 of 12 priority tasks complete.');

    // Keep one stable component locator across incremental updates
    const firstProject = preview.locator('demo-project-card').first();
    await firstProject
        .getByRole('button', {
            name: 'Watch',
            exact: true,
        })
        .click();
    await expect(
        firstProject.getByRole('button', {
            name: 'Watching',
            exact: true,
        }),
    ).toBeVisible();
    await expect(preview.locator('#sample-status')).toHaveText('Watching Customer onboarding.');

    // Audit both ACL documents through the unified workbench action
    await page.getByRole('button', { name: 'Audit accessibility' }).click();
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#a11y-summary')).toContainText('0 findings');
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Open workbench results' }).click();
    await expect(page.locator('#acl-a11y-scanner-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Close accessibility scanner' }).click();
    await page.getByRole('button', { name: 'Open preview results' }).click();
    await expect(preview.locator('#acl-a11y-scanner-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview.locator('#acl-a11y-scanner-modal')).toBeHidden();

    // Verify keyboard-accessible split resizing
    const splitter = page.locator('#workbench-splitter');
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', '52');

    // Patch component content in place while preserving Alpine state and the iframe document
    await page.getByRole('tab', { name: 'Components' }).click();
    const componentEditor = page.locator('#editor-components'),
        initialComponents = await componentEditor.inputValue();
    await componentEditor.fill(
        initialComponents
            .replace('class="project-card" x-data', 'class="project-card" data-hmr-marker="component-updated" x-data')
            .replace('class="profile">', 'class="profile" data-profile-hmr="selector-updated">'),
    );
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect(firstProject.locator('article')).toHaveAttribute('data-hmr-marker', 'component-updated');
    await expect(preview.locator('demo-profile-card .profile')).toHaveAttribute('data-profile-hmr', 'selector-updated');
    await expect(
        firstProject.getByRole('button', {
            name: 'Watching',
            exact: true,
        }),
    ).toBeVisible();
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'stale');
    expect(
        await preview.locator('html').evaluate(
            // Read the stable preview-realm marker
            () => window.__playgroundDocumentIdentity,
        ),
    ).toBe(initialDocumentIdentity);

    // Replace only the stable preview stylesheet
    await page
        .getByRole('tab', {
            name: 'CSS',
            exact: true,
        })
        .click();
    const cssEditor = page.locator('#editor-css'),
        initialCSS = await cssEditor.inputValue();
    await cssEditor.fill(initialCSS.replace('--page: #090f1d;', '--page: rgb(3, 7, 18);'));
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect
        .poll(
            // Read the authored body style from the unchanged preview document
            () => preview.locator('.demo-app').evaluate((app) => getComputedStyle(app).backgroundColor),
        )
        .toBe('rgb(3, 7, 18)');
    expect(
        await preview.locator('html').evaluate(
            // Read the stable preview-realm marker
            () => window.__playgroundDocumentIdentity,
        ),
    ).toBe(initialDocumentIdentity);

    // Re-execute JavaScript through its disposal contract without accumulating listeners
    await page.getByRole('tab', { name: 'JavaScript' }).click();
    const javascriptEditor = page.locator('#editor-javascript'),
        defaultJavaScript = await javascriptEditor.inputValue(),
        countedJavaScript =
            defaultJavaScript
                .replace(
                    'handleProjectToggle(event) {\n    this.status',
                    'handleProjectToggle(event) {\n    window.__projectToggleCalls = (window.__projectToggleCalls || 0) + 1;\n    this.status',
                )
                .replace('Stopped watching ', 'No longer tracking ') +
            '\nplaygroundHot.dispose(() => { window.__northstarDisposals = (window.__northstarDisposals || 0) + 1; });',
        runLabelBeforeJavaScript = await page.locator('#preview-run-label').textContent();
    await javascriptEditor.fill(countedJavaScript);
    await expect(page.locator('#preview-run-label')).not.toHaveText(runLabelBeforeJavaScript);
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect(themeToggle).toHaveAttribute('aria-pressed', 'true');
    const runLabelBeforeKeyboard = await page.locator('#preview-run-label').textContent();
    await javascriptEditor.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.locator('#preview-run-label')).not.toHaveText(runLabelBeforeKeyboard);
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    expect(
        await preview.locator('html').evaluate(
            // The forced rerun must dispose the previous authored module exactly once
            () => window.__northstarDisposals,
        ),
    ).toBe(1);
    await firstProject
        .getByRole('button', {
            name: 'Watching',
            exact: true,
        })
        .click();
    await expect(
        firstProject.getByRole('button', {
            name: 'Watch',
            exact: true,
        }),
    ).toBeVisible();
    await expect(preview.locator('#sample-status')).toHaveText('No longer tracking Customer onboarding.');
    expect(
        await preview.locator('html').evaluate(
            // One click must reach only the newest JavaScript listener
            () => window.__projectToggleCalls,
        ),
    ).toBe(1);

    // Surface and repair a preview accessibility finding through component HMR
    await page.getByRole('tab', { name: 'Components' }).click();
    const accessibleComponents = await componentEditor.inputValue();
    await componentEditor.fill(
        accessibleComponents.replace(
            '<h2>Priority projects</h2>',
            '<h2>Priority projects</h2><button data-a11y-probe type="button"></button>',
        ),
    );
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect(preview.locator('[data-a11y-probe]')).toBeVisible();
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'stale');
    await page.getByRole('button', { name: 'Audit accessibility' }).click();
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'issues');
    await expect(page.locator('#a11y-summary')).toContainText(/[1-9]\d* findings/);
    await componentEditor.fill(accessibleComponents);
    await expect(preview.locator('[data-a11y-probe]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Audit accessibility' }).click();
    await expect(page.locator('#a11y-summary')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#a11y-summary')).toContainText('0 findings');

    // Reject component contract changes until a deliberate Page HTML render
    const contentUpdatedComponents = await componentEditor.inputValue();
    await componentEditor.fill(
        contentUpdatedComponents.replace('"status": "String" }', '"status": "String", "priority": "String" }'),
    );
    await expect(page.locator('#status')).toHaveText(/Update \d+ failed/);
    await expect(page.locator('#console-output')).toContainText('require a Page HTML run');
    await expect(firstProject.locator('article')).toHaveAttribute('data-hmr-marker', 'component-updated');
    expect(
        await preview.locator('html').evaluate(
            // Structural rejection must retain the last good preview
            () => window.__playgroundDocumentIdentity,
        ),
    ).toBe(initialDocumentIdentity);

    // Edit Page HTML to accept every current source through the only full-render path
    await page.getByRole('tab', { name: 'Page HTML' }).click();
    const pageEditor = page.locator('#editor-page'),
        initialPage = await pageEditor.inputValue();
    await pageEditor.fill(initialPage.replace('name="Maya Chen"', 'name="Jordan Rivera"'));
    await expect(preview.locator('h1')).toHaveText('Good morning, Jordan.');
    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
    await expect(preview.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'false');
    expect(
        await preview.locator('html').evaluate(
            // A Page HTML run installs a new iframe document
            () => window.__playgroundDocumentIdentity,
        ),
    ).not.toBe(initialDocumentIdentity);

    // Confirm that the authored draft survives a parent-page reload
    expect(
        await page.evaluate(
            // Verify incompatible v4 drafts are not reused by the ACL-native sample
            () => ({
                v4: localStorage.getItem('acl-playground:v4'),
                v5: localStorage.getItem('acl-playground:v5'),
            }),
        ),
    ).toEqual({
        v4: null,
        v5: expect.any(String),
    });
    await page.reload();
    await expect(page.locator('#editor-page')).toHaveValue(/name="Jordan Rivera"/);
    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
    await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Good morning, Jordan.');

    // Surface an authored module failure in the bounded diagnostics region
    await page.getByRole('tab', { name: 'JavaScript' }).click();
    const persistedJavaScript = await javascriptEditor.inputValue();
    await javascriptEditor.fill("throw new Error('Playground test failure');");
    await page.getByRole('button', { name: 'Run preview' }).click();
    await expect(page.locator('#status')).toHaveText(/Update \d+ failed/);
    await page.getByRole('button', { name: 'Show diagnostics' }).click();
    await expect(page.locator('#console-output')).toContainText('Playground test failure');

    // Prove the console retains only the newest 50 entries
    await javascriptEditor.fill("for (let index = 0; index < 60; index += 1) console.log('entry-' + index);");
    await page.getByRole('button', { name: 'Run preview' }).click();
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect(page.locator('#console-output')).not.toContainText('entry-0\n');
    await expect(page.locator('#console-output')).toContainText('entry-59');

    // Restore the module and use the shared keyboard shortcut for an immediate run
    await javascriptEditor.fill(persistedJavaScript);
    await javascriptEditor.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.locator('#status')).toHaveText(/Ready · HMR · \d+ms/);
    await expect(page.frameLocator('#preview').locator('demo-stat-card')).toHaveCount(4);

    // Reset all persisted editors after accepting the explicit confirmation
    page.once(
        'dialog',
        // Accept the destructive local draft reset
        (dialog) => dialog.accept(),
    );
    await page.getByRole('button', { name: 'Reset sample' }).click();
    await expect(page.locator('#editor-page')).toHaveValue(/name="Maya Chen"/);
    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
    await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Good morning, Maya.');
    await expect(page.frameLocator('#preview').getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    expect(
        failures.filter(
            // Ignore the one intentional authored preview error
            (failure) => !failure.includes('Playground test failure'),
        ),
    ).toEqual([]);
    expect(sandboxWarnings).toEqual([]);
});
