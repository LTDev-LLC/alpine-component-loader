import { expect, test as base } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const coverageDirectory = process.env.ACL_BROWSER_COVERAGE_DIR;

// Make precise Chromium coverage an automatic property of the existing functional
// suite and keeps validation from running the same Chromium cases twice
export const test = base.extend({
    _aclPreciseCoverage: [
        async ({ page, browserName }, use, testInfo) => {
            // Extend the test fixture
            const enabled = Boolean(coverageDirectory) && browserName === 'chromium';
            if (enabled)
                await page.coverage.startJSCoverage({
                    resetOnNavigation: false,
                    reportAnonymousScripts: true,
                });
            await use();
            if (!enabled) return;
            const coverage = await page.coverage.stopJSCoverage(),
                id = createHash('sha256')
                    .update(
                        `${testInfo.project.name}:${testInfo.workerIndex}:${testInfo.retry}:${testInfo.titlePath.join('/')}`,
                    )
                    .digest('hex')
                    .slice(0, 20);
            await mkdir(coverageDirectory, { recursive: true });
            await writeFile(join(coverageDirectory, `${id}.json`), JSON.stringify(coverage));
        },
        { auto: true },
    ],
});

export { expect };
