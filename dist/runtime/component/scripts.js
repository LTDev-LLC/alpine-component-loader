// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Execute explicitly enabled scripts after sanitized content is committed
export const prepareScripts = (rootNode)=>{
    // Recreate script tags so inserted component scripts execute
    const scripts = [];
    {
        rootNode.querySelectorAll('script').forEach((oldScript)=>{
            // Process the current item
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(// Process the current item
            (attr)=>newScript.setAttribute(attr.name, attr.value));
            newScript.textContent = oldScript.textContent;
            scripts.push(newScript);
            oldScript.remove();
        });
    }
    return scripts;
};
