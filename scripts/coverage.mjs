import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    coverageRoot = join(projectRoot, 'coverage'),
    nodeCoverageRoot = join(coverageRoot, '.node'),
    browserCoverageRoot = join(coverageRoot, '.browser'),
    thresholds = {
        aggregateLines: 85,
        aggregateFunctions: 80,
        fileLines: 70,
        fileFunctions: 60,
    };

const walk = async (directory, extensions) => {
    // Walk
    const output = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) output.push(...(await walk(path, extensions)));
        else if (entry.isFile() && extensions.has(extname(path))) output.push(path);
    }
    return output.sort();
};

const run = (command, args, env = {}) => {
    // Run one child process and reject on any nonzero exit
    return new Promise((resolveRun, reject) => {
        // Settle the asynchronous operation
        const child = spawn(command, args, {
            cwd: projectRoot,
            env: {
                ...process.env,
                ...env,
            },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code) => {
            // Resolve successful child exits and reject every failure
            if (code === 0) resolveRun();
            else reject(new Error(`${command} exited with status ${code}.`));
        });
    });
};

const prepare = async () => {
    // Prepare
    await rm(coverageRoot, {
        recursive: true,
        force: true,
    });
    await Promise.all([mkdir(nodeCoverageRoot, { recursive: true }), mkdir(browserCoverageRoot, { recursive: true })]);
};

const collect = async () => {
    // Collect
    const unitFiles = (await readdir(join(projectRoot, 'tests/unit')))
        .filter(
            // Select matching items
            (name) => name.endsWith('.test.js'),
        )
        .sort()
        .map(
            // Transform the current item
            (name) => join('tests/unit', name),
        );
    await run(process.execPath, ['--test', ...unitFiles], { NODE_V8_COVERAGE: nodeCoverageRoot });
    await run(join(projectRoot, 'node_modules/.bin/playwright'), ['test', '--project=chromium'], {
        ACL_BROWSER_COVERAGE_DIR: browserCoverageRoot,
        NODE_V8_COVERAGE: nodeCoverageRoot,
    });
    // Keep wall-clock budgets outside precise coverage and parallel suite contention
    await run(join(projectRoot, 'node_modules/.bin/playwright'), [
        'test',
        'tests/performance.spec.js',
        '--project=chromium',
        '--workers=1',
    ]);
};

const sourcePaths = async () => {
    // List every authored module included in coverage reporting
    return [
        ...(await walk(join(projectRoot, 'src'), new Set(['.js']))),
        ...(await walk(join(projectRoot, 'server'), new Set(['.mjs']))),
        ...(await walk(join(projectRoot, 'bin'), new Set(['.mjs']))),
    ].sort();
};

const normalizeUrl = (raw) => {
    // Normalize url
    try {
        const url = new URL(raw);
        if (url.protocol === 'file:') return fileURLToPath(url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            const pathname = decodeURIComponent(url.pathname);
            if (/^\/(?:src|server|bin)\//.test(pathname)) return join(projectRoot, pathname.slice(1));
        }
    } catch {
        if (raw.startsWith(projectRoot)) return raw;
    }
    return null;
};

// Playwright serializes page.evaluate callbacks as anonymous scripts. Match
// their punctuation-insensitive source back to a unique included module so
// Chromium execution contributes to that module's line and function coverage
const canonicalSource = (source) => {
    const characters = [],
        offsets = [];
    // Iterate over the indexed values
    for (let index = 0; index < source.length; index++) {
        if (/\s|[();,]/.test(source[index])) continue;
        characters.push(source[index]);
        offsets.push(index);
    }
    return {
        text: characters.join(''),
        offsets,
    };
};

const canonicalIndexForOffset = (offsets, rawOffset) => {
    // Run the canonical index for offset operation
    let low = 0,
        high = offsets.length;
    // Continue until the operation completes
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (offsets[middle] < rawOffset) low = middle + 1;
        else high = middle;
    }
    return low;
};

const mapAnonymousEntry = (files, entry) => {
    // Map anonymous entry
    if (entry.url || typeof entry.source !== 'string') return null;
    const anonymous = canonicalSource(entry.source);
    if (anonymous.text.length < 80) return null;
    let match = null;
    // Process each entry
    for (const [path, record] of files) {
        record.canonical ||= canonicalSource(record.source);
        const index = record.canonical.text.indexOf(anonymous.text);
        if (index < 0 || record.canonical.text.indexOf(anonymous.text, index + 1) >= 0) continue;
        if (match) return null;
        match = {
            path,
            record,
            index,
        };
    }
    if (!match) return null;
    const translatedFunctions = (entry.functions || []).map(
        // Transform the current item
        (fn) => ({
            ...fn,
            ranges: (fn.ranges || []).map((range) => {
                // Transform the current item
                const startIndex = match.index + canonicalIndexForOffset(anonymous.offsets, range.startOffset),
                    endIndex = match.index + canonicalIndexForOffset(anonymous.offsets, range.endOffset),
                    startOffset =
                        match.record.canonical.offsets[Math.min(startIndex, match.record.canonical.offsets.length - 1)],
                    endOffset =
                        endIndex >= match.record.canonical.offsets.length
                            ? match.record.source.length
                            : match.record.canonical.offsets[endIndex];
                return {
                    ...range,
                    startOffset,
                    endOffset: Math.max(startOffset + 1, endOffset),
                };
            }),
        }),
    );
    return {
        ...entry,
        url: pathToFileURL(match.path).href,
        functions: translatedFunctions,
    };
};

const addEntry = (files, entry) => {
    // Add entry
    entry = mapAnonymousEntry(files, entry) || entry;
    const path = normalizeUrl(entry.url || '');
    if (!path || !files.has(path)) return;
    const target = files.get(path);
    target.executions.push(entry.functions || []);
    // Process each fn
    for (const fn of entry.functions || []) {
        const first = fn.ranges?.[0];
        if (!first) continue;
        const key = `${fn.functionName || ''}:${first.startOffset}:${first.endOffset}`;
        let stored = target.functions.get(key);
        if (!stored) {
            stored = {
                name: fn.functionName || '(anonymous)',
                ranges: new Map(),
            };
            target.functions.set(key, stored);
        }
        // Process each range
        for (const range of fn.ranges) {
            const rangeKey = `${range.startOffset}:${range.endOffset}`;
            stored.ranges.set(rangeKey, (stored.ranges.get(rangeKey) || 0) + Number(range.count || 0));
        }
    }
};

const readJsonFiles = async (directory) => {
    // Read json files
    const names = await readdir(directory);
    return await Promise.all(
        names
            .filter(
                // Select matching items
                (name) => name.endsWith('.json'),
            )
            .map(
                // Transform the current item
                async (name) => JSON.parse(await readFile(join(directory, name), 'utf8')),
            ),
    );
};

const executableOffset = (line, lineStart) => {
    // Run the executable offset operation
    const match = line.match(/\S/);
    if (!match || /^\s*(?:\/\/|\/\*|\*|\*\/)/.test(line)) return null;
    return lineStart + match.index;
};

const summarizeFile = (record) => {
    // Run the summarize file operation
    const executionRanges = record.executions.map(
            // Transform the current item
            (functions) =>
                functions.flatMap(
                    // Expand the current item
                    (fn) =>
                        (fn.ranges || []).map(
                            // Transform the current item
                            (range) => ({
                                start: range.startOffset,
                                end: range.endOffset,
                                count: Number(range.count || 0),
                                length: range.endOffset - range.startOffset,
                            }),
                        ),
                ),
        ),
        lineDetails = [],
        lines = record.source.split('\n');
    let offset = 0;
    // Iterate over the indexed values
    for (let index = 0; index < lines.length; index++) {
        const probe = executableOffset(lines[index], offset),
            number = index + 1;
        offset += lines[index].length + 1;
        if (probe == null) continue;
        const count = executionRanges.reduce((total, ranges) => {
            // Accumulate the current item
            const candidates = ranges
                .filter(
                    // Select matching items
                    (range) => range.start <= probe && range.end > probe,
                )
                .sort(
                    // Compare the current items
                    (a, b) => a.length - b.length,
                );
            return total + (candidates[0]?.count || 0);
        }, 0);
        lineDetails.push({
            number,
            count,
        });
    }
    const functionDetails = [...record.functions.values()]
        .map((fn, index) => {
            // Transform the current item
            const [key, count] = fn.ranges.entries().next().value || ['', 0],
                start = Number(key.split(':')[0] || 0),
                line = record.source.slice(0, start).split('\n').length;
            return {
                name: fn.name === '(anonymous)' ? `(anonymous_${index + 1})` : fn.name,
                line,
                count,
            };
        })
        .filter(
            // Select matching items
            (fn) => !(fn.line === 1 && fn.name.startsWith('(anonymous_') && fn.count > 0),
        );
    return {
        lines: {
            total: lineDetails.length,
            covered: lineDetails.filter(
                // Select matching items
                (line) => line.count > 0,
            ).length,
        },
        functions: {
            total: functionDetails.length,
            covered: functionDetails.filter(
                // Select matching items
                (fn) => fn.count > 0,
            ).length,
        },
        lineDetails,
        functionDetails,
    };
};

const percent = ({ covered, total }) => {
        // Convert a coverage count to its percentage
        return total ? (covered / total) * 100 : 100;
    },
    metric = (value) => {
        // Add skipped and percentage fields to one coverage metric
        return {
            ...value,
            skipped: 0,
            pct: Number(percent(value).toFixed(2)),
        };
    };

const report = async () => {
    // Report
    const paths = await sourcePaths(),
        files = new Map(
            await Promise.all(
                paths.map(
                    // Transform the current item
                    async (path) => [
                        path,
                        {
                            source: await readFile(path, 'utf8'),
                            functions: new Map(),
                            executions: [],
                            canonical: null,
                        },
                    ],
                ),
            ),
        );
    // Add every Node coverage entry to the merged file map
    for (const payload of await readJsonFiles(nodeCoverageRoot)) {
        // Process each Node coverage entry
        for (const entry of payload.result || []) addEntry(files, entry);
    }
    // Add every browser coverage entry to the merged file map
    for (const payload of await readJsonFiles(browserCoverageRoot)) {
        // Process each browser coverage entry
        for (const entry of payload || []) addEntry(files, entry);
    }

    const summaries = new Map(
            [...files].map(
                // Transform the current item
                ([path, record]) => [path, summarizeFile(record)],
            ),
        ),
        totals = {
            lines: {
                total: 0,
                covered: 0,
            },
            functions: {
                total: 0,
                covered: 0,
            },
        };
    // Process each summary
    for (const summary of summaries.values()) {
        // Process each name
        for (const name of ['lines', 'functions']) {
            totals[name].total += summary[name].total;
            totals[name].covered += summary[name].covered;
        }
    }

    const rows = [],
        failures = [];
    // Process each entry
    for (const [path, summary] of summaries) {
        const name = relative(projectRoot, path),
            linePct = percent(summary.lines),
            functionPct = percent(summary.functions);
        rows.push(`${name.padEnd(38)} ${linePct.toFixed(2).padStart(7)}% ${functionPct.toFixed(2).padStart(9)}%`);
        if (linePct < thresholds.fileLines)
            failures.push(`${name} line coverage ${linePct.toFixed(2)}% < ${thresholds.fileLines}%`);
        if (functionPct < thresholds.fileFunctions)
            failures.push(`${name} function coverage ${functionPct.toFixed(2)}% < ${thresholds.fileFunctions}%`);
    }
    const aggregateLines = percent(totals.lines),
        aggregateFunctions = percent(totals.functions);
    if (aggregateLines < thresholds.aggregateLines)
        failures.push(`aggregate line coverage ${aggregateLines.toFixed(2)}% < ${thresholds.aggregateLines}%`);
    if (aggregateFunctions < thresholds.aggregateFunctions)
        failures.push(
            `aggregate function coverage ${aggregateFunctions.toFixed(2)}% < ${thresholds.aggregateFunctions}%`,
        );

    const text = [
            'File                                     Lines Functions',
            '----------------------------------------------------------',
            ...rows,
            '----------------------------------------------------------',
            `${'All files'.padEnd(38)} ${aggregateLines.toFixed(2).padStart(7)}% ${aggregateFunctions.toFixed(2).padStart(9)}%`,
            ...(failures.length
                ? [
                      '',
                      'Coverage gate failures:',
                      ...failures.map(
                          // Transform the current item
                          (item) => `- ${item}`,
                      ),
                  ]
                : []),
            '',
        ].join('\n'),
        jsonSummary = {
            total: {
                lines: metric(totals.lines),
                functions: metric(totals.functions),
                statements: metric(totals.lines),
                branches: metric({
                    total: 0,
                    covered: 0,
                }),
            },
        };
    // Process each entry
    for (const [path, summary] of summaries) {
        jsonSummary[path] = {
            lines: metric(summary.lines),
            functions: metric(summary.functions),
            statements: metric(summary.lines),
            branches: metric({
                total: 0,
                covered: 0,
            }),
        };
    }
    const lcov = [...summaries]
        .flatMap(
            // Expand the current item
            ([path, summary]) => [
                'TN:',
                `SF:${path}`,
                ...summary.functionDetails.flatMap(
                    // Expand the current item
                    (fn) => [`FN:${fn.line},${fn.name}`, `FNDA:${fn.count},${fn.name}`],
                ),
                `FNF:${summary.functions.total}`,
                `FNH:${summary.functions.covered}`,
                ...summary.lineDetails.map(
                    // Transform the current item
                    (line) => `DA:${line.number},${line.count}`,
                ),
                `LF:${summary.lines.total}`,
                `LH:${summary.lines.covered}`,
                'end_of_record',
            ],
        )
        .join('\n');
    await Promise.all([
        writeFile(join(coverageRoot, 'coverage.txt'), text),
        writeFile(join(coverageRoot, 'coverage-summary.json'), `${JSON.stringify(jsonSummary, null, 2)}\n`),
        writeFile(join(coverageRoot, 'lcov.info'), `${lcov}\n`),
    ]);
    process.stdout.write(`\n${text}`);
    if (failures.length) process.exitCode = 1;
};

await prepare();
await collect();
await report();
