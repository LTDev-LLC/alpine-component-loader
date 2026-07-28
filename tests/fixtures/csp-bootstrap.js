// Register data during Alpine startup before the loader initializes the tree
document.addEventListener('alpine:init', () => {
    // Handle the alpine:init event
    window.Alpine.data('aclCounter', () => {
        // Create Alpine component state
        return { count: 1 };
    });
});
