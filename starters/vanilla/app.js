import AlpineComponentLoader from 'alpine-component-loader';

await AlpineComponentLoader.registerManifestFrom('./acl-manifest.json');
await AlpineComponentLoader.start();
