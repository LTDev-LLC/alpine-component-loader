// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Shared DOM focus keyboard and bounded timeline helpers for opt-in overlays
export const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export const toCss = (style) => {
    // Run the to css operation
    return Object.entries(style || {})
        .map(
            // Transform the current item
            ([key, value]) =>
                `${key.replace(
                    /[A-Z]/g,
                    // Transform the matched text
                    (match) => `-${match.toLowerCase()}`,
                )}:${value}`,
        )
        .join(';');
};

export const createUiNode = (documentRef, tag, { className = '', text = '', style = null, ariaLabel = '' } = {}) => {
    // Create ui node
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    if (style) element.style.cssText = toCss(style);
    if (ariaLabel) element.setAttribute('aria-label', ariaLabel);
    return element;
};

export const appendUiNode = (documentRef, parent, tag, className, text, style) => {
    // Run the append ui node operation
    const element = createUiNode(documentRef, tag, {
        className,
        text,
        style,
    });
    parent.appendChild(element);
    return element;
};

export const createUiButton = (documentRef, text, style, className = '') => {
    // Create ui button
    const button = createUiNode(documentRef, 'button', {
        className,
        text,
        style,
    });
    button.type = 'button';
    return button;
};

export const restoreOverlayFocus = (target) => {
    // Restore overlay focus
    if (target?.isConnected && typeof target.focus === 'function') target.focus();
};

export const trapOverlayFocus = (event, container, documentRef, fallback = container) => {
    // Run the trap overlay focus operation
    if (event.key !== 'Tab') return false;
    const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    if (!focusable.length) {
        event.preventDefault();
        fallback.focus();
        return true;
    }
    const first = focusable[0],
        last = focusable[focusable.length - 1];
    if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
        return true;
    }
    if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
        return true;
    }
    return false;
};

export const pushBoundedRecord = (records, record, capacity) => {
    // Run the push bounded record operation
    records.push(record);
    if (records.length > capacity) records.splice(0, records.length - capacity);
    return record;
};
