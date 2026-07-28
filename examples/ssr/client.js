import AlpineComponentLoader from '/dist/index.min.js';

Alpine.data('profileCard', () => {
    // Create Alpine component state
    return {
        name: 'Server-rendered profile',
        status: 'Available before JavaScript',
        count: 0,
        init() {
            // Run the init operation
            const props = this.$props;
            this.name = props.name;
            this.status = props.$data ? props.$data.status : this.status;
            this.count = Number(props.count);
        },
        increment() {
            // Run the increment operation
            this.count += 1;
            this.$props.count = this.count;
        },
    };
});

const manifest = await fetch('/acl-manifest.json').then(
    // Handle the resolved operation
    (response) => response.json(),
);
await AlpineComponentLoader.registerManifest(manifest);
await AlpineComponentLoader.start();

const profile = document.querySelector('profile-card'),
    status = document.getElementById('hydration-status');
if (profile?._state === 'ready')
    status.textContent = profile.hasAttribute('data-acl-hydrated')
        ? 'Hydrated in place'
        : 'Client fallback after revision mismatch';
else
    profile?.addEventListener(
        'acl:hydrationend',
        () => {
            // Run the deferred operation
            status.textContent = 'Hydrated in place';
        },
        { once: true },
    );
profile?.addEventListener(
    'loaded',
    // Run the deferred operation
    () =>
        setTimeout(() => {
            // Run the scheduled delayed task
            if (!profile.hasAttribute('data-acl-hydrated'))
                status.textContent = 'Client fallback after revision mismatch';
        }, 0),
    { once: true },
);
