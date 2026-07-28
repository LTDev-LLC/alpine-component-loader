import AlpineComponentLoader from '/dist/index.js';

// Yield until the deferred CSP build exposes its global runtime
const waitForAlpine = async () => {
    // Continue until the operation completes
    while (!window.Alpine)
        await new Promise(
            // Settle the asynchronous operation
            (resolve) => setTimeout(resolve, 0),
        );
};

await waitForAlpine();
AlpineComponentLoader.config({ autoStart: false });

// Register the component entirely through CSP-compatible Alpine expressions
const template = document.createElement('template');
template.id = 'csp-counter-template';
template.innerHTML = `
    <section aria-labelledby="counter-title" x-data="aclCounter">
        <h1 id="counter-title">CSP counter</h1>
        <button type="button" x-on:click="count++">Increment</button>
        <output aria-live="polite" x-text="count"></output>
        <span data-prop x-text="$props.label"></span>
    </section>
`;
document.body.appendChild(template);
AlpineComponentLoader.define('csp-counter', '#csp-counter-template', {
    attributes: { label: String },
});
await AlpineComponentLoader.start();

const counter = document.createElement('csp-counter');
counter.setAttribute('label', 'CSP');
document.body.appendChild(counter);
counter.addEventListener(
    'loaded',
    () => {
        // Handle the loaded event
        window.__cspReady = true;
    },
    { once: true },
);
