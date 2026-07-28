// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Construct one custom-element class from an explicit immutable definition
// context while keeping the browser base class as an argument for SSR-safe imports
export const createComponentElementClass = ({ base, context, controllers }) => {
    if (typeof base !== 'function')
        throw new TypeError('[ACL] Component construction requires a browser HTMLElement base class.');
    if (
        !Array.isArray(controllers) ||
        !controllers.length ||
        controllers.some(
            // Check the current item
            (controller) => typeof controller !== 'function',
        )
    )
        throw new TypeError('[ACL] Component construction requires implementation controllers.');
    const definitionContext = Object.freeze({ ...(context || {}) }),
        elementClass = controllers.reduce(
            // Accumulate the current item
            (current, controller) => controller(current, definitionContext),
            base,
        );
    if (typeof elementClass !== 'function' || !(elementClass.prototype instanceof base))
        throw new TypeError('[ACL] Component implementation factories must return an HTMLElement subclass.');
    return elementClass;
};
