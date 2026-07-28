// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), { hasOwn } = await importLocalModule('./config.js');
const DEFAULT_INDEXED_DB_NAME = 'alpine-component-loader', DEFAULT_INDEXED_DB_STORE = 'persistence';
// Open an IndexedDB database and create the persistence store during upgrades
const openIndexedDB = (indexedDBImpl, databaseName, storeName, version = null)=>new Promise((resolve, reject)=>{
        // Settle the asynchronous operation
        let request, settled = false;
        // Settle open failures once and let late successful requests close themselves
        const fail = (error)=>{
            if (settled) return;
            settled = true;
            reject(error);
        };
        // Guard the open indexed db operation against runtime failures
        try {
            request = version == null ? indexedDBImpl.open(databaseName) : indexedDBImpl.open(databaseName, version);
        } catch (error) {
            fail(error);
            return;
        }
        request.onupgradeneeded = ()=>{
            // Settle the asynchronous operation
            try {
                if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
            } catch (error) {
                request.transaction?.abort();
                fail(error);
            }
        };
        request.onerror = ()=>{
            // Settle the asynchronous operation
            return fail(request.error || new Error(`Unable to open IndexedDB database "${databaseName}"`));
        };
        request.onblocked = ()=>{
            // Settle the asynchronous operation
            return fail(new Error(`Opening IndexedDB database "${databaseName}" was blocked`));
        };
        request.onsuccess = ()=>{
            // Settle the asynchronous operation
            const database = request.result;
            if (settled) {
                database.close();
                return;
            }
            settled = true;
            resolve(database);
        };
    });
// Create a storage-compatible asynchronous adapter backed by IndexedDB
export const createIndexedDBPersistenceAdapter = ({ databaseName = DEFAULT_INDEXED_DB_NAME, storeName = DEFAULT_INDEXED_DB_STORE, indexedDBImpl = globalThis.indexedDB } = {})=>{
    const resolvedDatabaseName = typeof databaseName === 'string' ? databaseName.trim() : '', resolvedStoreName = typeof storeName === 'string' ? storeName.trim() : '';
    if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') throw new TypeError('IndexedDB is not available in this environment');
    if (!resolvedDatabaseName || !resolvedStoreName) throw new TypeError('IndexedDB databaseName and storeName must be non-empty strings');
    let databasePromise = null;
    // Ensure custom stores can be added to an existing database with a version upgrade
    const openDatabase = async ()=>{
        let database = await openIndexedDB(indexedDBImpl, resolvedDatabaseName, resolvedStoreName);
        if (database.objectStoreNames.contains(resolvedStoreName)) return database;
        const nextVersion = database.version + 1;
        database.close();
        database = await openIndexedDB(indexedDBImpl, resolvedDatabaseName, resolvedStoreName, nextVersion);
        if (!database.objectStoreNames.contains(resolvedStoreName)) {
            database.close();
            throw new Error(`IndexedDB store "${resolvedStoreName}" could not be created`);
        }
        return database;
    };
    // Reuse one connection until another context requests a database version change
    const getDatabase = ()=>{
        if (!databasePromise) {
            const opening = openDatabase(), connection = opening.then((database)=>{
                // Handle the resolved operation
                database.onversionchange = ()=>{
                    // Handle the resolved operation
                    database.close();
                    if (databasePromise === connection) databasePromise = null;
                };
                return database;
            }).catch((error)=>{
                // Handle the rejected operation
                if (databasePromise === connection) databasePromise = null;
                throw error;
            });
            databasePromise = connection;
        }
        return databasePromise;
    };
    // Resolve operations only after their transaction commits
    const runTransaction = async (mode, operation)=>{
        const database = await getDatabase();
        return await new Promise((resolve, reject)=>{
            // Settle the asynchronous operation
            let request, result, settled = false;
            const transaction = database.transaction(resolvedStoreName, mode), fail = (error)=>{
                // Reject the transaction once with its first failure
                if (settled) return;
                settled = true;
                reject(error);
            };
            transaction.oncomplete = ()=>{
                // Settle the asynchronous operation
                if (settled) return;
                settled = true;
                resolve(result);
            };
            transaction.onerror = ()=>{
                // Settle the asynchronous operation
                return fail(transaction.error || request?.error || new Error('IndexedDB transaction failed'));
            };
            transaction.onabort = ()=>{
                // Settle the asynchronous operation
                return fail(transaction.error || request?.error || new Error('IndexedDB transaction was aborted'));
            };
            // Guard the run transaction operation against runtime failures
            try {
                request = operation(transaction.objectStore(resolvedStoreName));
                request.onsuccess = ()=>{
                    // Settle the asynchronous operation
                    result = request.result;
                };
                request.onerror = ()=>{
                    // Settle the asynchronous operation
                    return fail(request.error || new Error('IndexedDB request failed'));
                };
            } catch (error) {
                // Guard the run transaction operation against runtime failures
                try {
                    transaction.abort();
                } catch  {
                // The transaction may already be inactive
                }
                fail(error);
            }
        });
    };
    return {
        // Read a string record using the Web Storage adapter contract
        async getItem (key) {
            const value = await runTransaction('readonly', // Execute the transaction fixture
            (store)=>store.get(String(key)));
            return value == null ? null : value;
        },
        // Commit a string record under the normalized storage key
        async setItem (key, value) {
            await runTransaction('readwrite', // Execute the transaction fixture
            (store)=>store.put(String(value), String(key)));
        },
        // Remove a record without affecting other component state
        async removeItem (key) {
            await runTransaction('readwrite', // Execute the transaction fixture
            (store)=>store.delete(String(key)));
        },
        // Close the lazily opened connection when a custom adapter is retired
        close () {
            const pending = databasePromise;
            databasePromise = null;
            if (pending) void pending.then((database)=>{
                // Handle the resolved operation
                database.close();
            }).catch(()=>{
            // Ignore connection cleanup failures
            });
        }
    };
};
// Wrap persisted component data in a normalized versioned envelope
export const createPersistenceEnvelope = (version, data)=>({
        version: Math.max(1, Number(version) || 1),
        data
    });
// Deep-snapshot public serializable props while excluding runtime helpers and functions
export const snapshotPersistentProps = (props)=>JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(props || {}).filter(// Select matching items
    ([name, value])=>!name.startsWith('$') && typeof value !== 'function'))));
// Decode a versioned record, run migrations, and flag records needing rewrite
export const decodePersistedValue = async (raw, { version = 1, key = '', component = null, migrate = null } = {})=>{
    if (raw == null) return {
        data: null,
        fromVersion: null,
        shouldWrite: false,
        envelope: null
    };
    const targetVersion = Math.max(1, Number(version) || 1), parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || !hasOwn(parsed, 'version') || !hasOwn(parsed, 'data')) throw new TypeError('[ACL] Persisted records must use a { version, data } envelope.');
    const fromVersion = Number(parsed.version);
    if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new TypeError('[ACL] Persisted record versions must be positive integers.');
    let data = parsed.data;
    if (fromVersion !== targetVersion && typeof migrate === 'function') data = await migrate(data, {
        fromVersion,
        toVersion: targetVersion,
        key,
        component
    });
    return {
        data,
        fromVersion,
        shouldWrite: fromVersion !== targetVersion,
        envelope: createPersistenceEnvelope(targetVersion, data)
    };
};
