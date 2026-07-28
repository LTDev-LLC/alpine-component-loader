import fc from 'fast-check';
import { parseFragment } from 'parse5';
import { expect, test } from './fixtures/loader.js';
import { sanitizeSSRHtml } from '../server/ssr.mjs';

const SECURITY_ATTRIBUTES = new Set([
    'href',
    'src',
    'xlink:href',
    'action',
    'formaction',
    'poster',
    'data',
    'srcset',
    'srcdoc',
]);

// Run this operation
const securitySignature = (html) => {
    const output = [],
        // Run this operation
        visit = (root, path = '') => {
            let elementIndex = 0;
            // Run this operation
            for (const node of root?.childNodes || []) {
                if (!node.tagName) continue;
                const currentPath = `${path}/${node.tagName}[${elementIndex++}]`,
                    attributes = Object.fromEntries(
                        // Run this operation
                        (node.attrs || []).map((attribute) => [attribute.name, attribute.value]),
                    );
                if (
                    node.tagName === 'script' ||
                    node.tagName === 'base' ||
                    (node.tagName === 'meta' && attributes['http-equiv']?.toLowerCase() === 'refresh')
                )
                    output.push(`${currentPath}:element`);
                // Run this operation
                for (const [name, value] of Object.entries(attributes)) {
                    if (name.startsWith('on') || SECURITY_ATTRIBUTES.has(name))
                        output.push(`${currentPath}:${name}=${value}`);
                }
                visit(node, currentPath);
                if (node.content) visit(node.content, `${currentPath}/template`);
            }
        };
    visit(parseFragment(String(html)));
    return output;
};

// Run this operation
test('browser and SSR sanitizers retain the same security-relevant markup under fuzzed HTML', async ({
    page,
    loaderServer,
}, testInfo) => {
    const seed = Number(process.env.ACL_FUZZ_SEED || 20260723),
        values = [
            'https://example.test/asset',
            '/relative/path',
            '#anchor',
            'javascript:alert(1)',
            ' java\\nscript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'data:image/svg+xml,<svg onload=alert(1)>',
            'mailto:test@example.test',
        ],
        attributeArbitrary = fc.constantFrom(
            'href',
            'src',
            'xlink:href',
            'action',
            'formaction',
            'poster',
            'data',
            'srcset',
            'srcdoc',
            'onclick',
        ),
        tagArbitrary = fc.constantFrom('a', 'img', 'form', 'iframe', 'object', 'svg', 'template'),
        valueArbitrary = fc.constantFrom(...values),
        generated = fc.sample(
            fc
                .tuple(tagArbitrary, attributeArbitrary, valueArbitrary, fc.boolean())
                // Run this operation
                .map(([tag, attribute, value, nested]) => {
                    const markup = `<${tag}\n ${attribute}='${value}'><span formaction="${value}">safe</span></${tag}>`;
                    return nested ? `<template><svg>${markup}</svg></template>` : markup;
                }),
            {
                seed,
                numRuns: 200,
            },
        ),
        corpus = [
            ...generated,
            '<base href="https://example.test/"><p>base</p>',
            '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
            '<script src="/safe.js"></script>',
            '<template><template><a href="javascript:alert(1)">nested</a></template></template>',
            '<img srcset="/safe.png 1x, javascript:alert(1) 2x">',
        ];
    await page.goto(`${loaderServer.baseUrl}/blank`);
    const browserOutput = await page.evaluate(
        // Run this operation
        async ({ baseUrl, samples }) => {
            const { htmlToFragment, sanitizeNodeTree } = await import(`${baseUrl}/src/runtime/rendering.js`);
            // Run this operation
            return samples.map((sample) => {
                const fragment = sanitizeNodeTree(htmlToFragment(sample)),
                    holder = document.createElement('template');
                holder.content.appendChild(fragment);
                return holder.innerHTML;
            });
        },
        {
            baseUrl: loaderServer.baseUrl,
            samples: corpus,
        },
    );

    // Run this operation
    for (let index = 0; index < corpus.length; index++) {
        const server = sanitizeSSRHtml(corpus[index]);
        expect(
            securitySignature(browserOutput[index]),
            `sanitizer parity failed for seed ${seed}, sample ${index}: ${corpus[index]}`,
        ).toEqual(securitySignature(server));
        expect(
            // Run this operation
            securitySignature(server).some((entry) =>
                /javascript:|data:text\/html|:onclick=|:srcdoc=|:element$/.test(entry),
            ),
        ).toBe(false);
    }
    await testInfo.attach('sanitizer-fuzz.json', {
        body: Buffer.from(
            JSON.stringify(
                {
                    // Retain the deterministic reproduction coordinates
                    seed,
                    samples: corpus.length,
                },
                null,
                2,
            ),
        ),
        contentType: 'application/json',
    });
});
