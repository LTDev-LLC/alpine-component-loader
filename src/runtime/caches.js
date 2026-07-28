// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Share runtime caches across loader instances and public entry points
export const styleSheetCache = new Map(),
    scriptLoadCache = new Map(),
    styleLoadPromiseCache = new Map(),
    templateLoadCache = new Map(),
    templateLoadMetaCache = new Map();
