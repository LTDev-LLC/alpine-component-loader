// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

export const ACL_LIFECYCLE_STATES = new Set([
    'idle',
    'deferred',
    'loading',
    'ready',
    'deactivated',
    'destroyed'
]);
// Apply one validated lifecycle state and keep the accessibility state aligned
export const applyLifecycleState = (host, state)=>{
    if (!ACL_LIFECYCLE_STATES.has(state)) throw new TypeError(`[ACL] Unknown lifecycle state "${state}".`);
    host._state = state;
    const visibleSsr = state === 'deferred' && host?._ssrHydration;
    host.setAttribute?.('aria-busy', !visibleSsr && (state === 'deferred' || state === 'loading') ? 'true' : 'false');
    return state;
};
// Build the common event payload shared by all public lifecycle events
export const createLifecycleEventDetail = (host, tagName, detail = {})=>({
        component: host,
        tagName,
        props: host.$props,
        timestamp: Date.now(),
        ...detail
    });
