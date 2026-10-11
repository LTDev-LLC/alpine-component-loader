// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Install optional slot projection while retaining original consumer node identities
export const withSlots = (Base) =>
    class extends Base {
        _captureLightSlots() {
            this._lightSlotNodes ||= new Set();
            this._originalLightDom ||= document.createDocumentFragment();
            // Recover only tracked consumer nodes; rendered template nodes are never slot input
            const nodesToStore = [];
            this._lightSlotNodes.forEach((node) => {
                // Process the current item
                if (!node.parentNode) {
                    this._lightSlotNodes.delete(node);
                    return;
                }
                if (node.parentNode !== this._originalLightDom) nodesToStore.push(node);
            });
            this._originalLightDom.append(...nodesToStore);

            // Before the first render, direct host children are consumer-provided slot nodes
            if (!this._hasRenderedContent) {
                // Exclude loader placeholders while retaining every authored slot node by identity
                const initialNodes = Array.from(this.childNodes).filter((node) => {
                    // Select matching items
                    if (this._ssrLightNodes?.has(node)) return false;
                    if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.hasAttribute('data-acl-placeholder') || node.hasAttribute('data-acl-loading'))
                    ) {
                        node.remove();
                        return false;
                    }
                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-form-proxy')) return false;
                    this._lightSlotNodes.add(node);
                    return true;
                });
                this._originalLightDom.append(...initialNodes);
            }

            // Sort tracked nodes while they physically remain in the storage fragment
            const slots = { default: [] };
            this._lightSlotNodes.forEach((node) => {
                // Process the current item
                const name =
                    node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('slot')
                        ? node.getAttribute('slot')
                        : 'default';
                (slots[name] ||= []).push(node);
            });
            return slots;
        }

        _initSlotObserver() {
            if (this._slotObserver) return;

            this._slotObserver = new MutationObserver(
                // Process observed DOM mutations
                (mutations) =>
                    mutations.forEach((mutation) => {
                        // Process the current item
                        mutation.addedNodes.forEach((node) => {
                            // Only handle Elements and Text nodes
                            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return;

                            // Ignore the slot containers themselves if they trigger an add
                            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-slot')) return;
                            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-form-proxy')) return;

                            // Determine target slot name + find the internal slot container
                            const slotName =
                                    (node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('slot') : null) ||
                                    'default',
                                container = this._root.querySelector(`div[data-acl-slot="${slotName}"]`);

                            // Move the node into the container
                            if (container) {
                                (this._lightSlotNodes ||= new Set()).add(node);
                                container.appendChild(node);
                            }
                        });
                    }),
            );

            // Only observe direct children additions
            this._slotObserver.observe(this, { childList: true });
        }
    };
// Replace slots in sanitized component content
export const projectSlots = (rootNode, lightSlots) => {
    // Replace Light DOM slots with containers that can receive user nodes
    {
        // Replace light DOM slots with persistent containers for later observer updates
        rootNode.querySelectorAll('slot').forEach((slotEl) => {
            // Process the current item
            const name = slotEl.getAttribute('name') || 'default';

            // Create a transparent wrapper acting as the slot
            const anchor = document.createElement('div');
            anchor.style.display = 'contents';
            anchor.setAttribute('data-acl-slot', name);

            // Insert pre-captured nodes on the initial render
            const nodesToInsert = lightSlots ? lightSlots[name] : null;
            if (nodesToInsert && nodesToInsert.length > 0) anchor.append(...nodesToInsert);
            // Preserve fallback slot content when no user nodes exist
            else if (slotEl.childNodes.length > 0) {
                anchor.append(...Array.from(slotEl.childNodes));
            }

            // Replace the <slot> tag with our anchor
            slotEl.replaceWith(anchor);
        });
    }
};
