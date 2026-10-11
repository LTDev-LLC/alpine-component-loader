import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from './alpine-runtime.mjs';

export const exampleControlStylesheets = [
    'examples/a11y/styles.css',
    'examples/feature-lab/styles.css',
    'examples/feature-lab-ssr/styles.css',
    'examples/hmr/styles.css',
    'examples/offline/styles.css',
    'examples/playground/styles.css',
    'examples/feature-lab/demos/frame.css',
];

// Embed shared rules in existing responses so examples retain standalone delivery
export const prepareExampleControls = async (root = repositoryRoot) => {
    const controls = (await readFile(resolve(root, 'scripts/example-controls.css'), 'utf8')).trim(),
        start = '/* BEGIN GENERATED EXAMPLE CONTROLS */',
        end = '/* END GENERATED EXAMPLE CONTROLS */';
    // Replace the generated region without changing each example's authored layout or component styles
    for (const file of exampleControlStylesheets) {
        const path = resolve(root, file),
            source = await readFile(path, 'utf8'),
            index = source.indexOf(start),
            region = `${start}\n${controls}\n${end}`;
        let output;
        if (index < 0) output = `${source.trimEnd()}\n\n${region}\n`;
        else {
            const finish = source.indexOf(end, index);
            if (finish < 0) throw new TypeError(`Unclosed generated controls region in ${file}.`);
            output = source.slice(0, index) + region + source.slice(finish + end.length);
        }
        if (output !== source) await writeFile(path, output);
    }
};
