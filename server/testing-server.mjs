import { startACLDevServer } from './dev-server.mjs';

// Start an ephemeral loopback server suitable for Playwright and Vitest Browser Mode
export const startACLTestServer = ({
    root = process.cwd(),
    index = 'index.html',
    host = '127.0.0.1',
    port = 0,
    watchFiles = false,
    ...options
} = {}) =>
    startACLDevServer({
        root,
        index,
        host,
        port,
        watchFiles,
        ...options,
    });

export default { startACLTestServer };
