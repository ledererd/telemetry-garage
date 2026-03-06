/**
 * Cache Manager
 * Handles local caching of telemetry data using IndexedDB
 */

class CacheManager {
    constructor() {
        this.dbName = 'RacingTelemetryDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionsStore = db.createObjectStore('sessions', { keyPath: 'session_id' });
                    sessionsStore.createIndex('start_time', 'start_time', { unique: false });
                }

                // Telemetry data store
                if (!db.objectStoreNames.contains('telemetry')) {
                    const telemetryStore = db.createObjectStore('telemetry', { keyPath: 'id', autoIncrement: true });
                    telemetryStore.createIndex('session_id', 'session_id', { unique: false });
                    telemetryStore.createIndex('lap_number', 'lap_number', { unique: false });
                    telemetryStore.createIndex('timestamp', 'timestamp', { unique: false });
                    telemetryStore.createIndex('session_lap', ['session_id', 'lap_number'], { unique: false });
                }

                // Cache metadata store
                if (!db.objectStoreNames.contains('cache_metadata')) {
                    const metadataStore = db.createObjectStore('cache_metadata', { keyPath: 'key' });
                }
            };
        });
    }

    async cacheSessions(sessions) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');

            // Clear existing sessions
            store.clear();

            // Add new sessions
            sessions.forEach(session => {
                store.add(session);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getCachedSessions() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async cacheTelemetryData(sessionId, lapNumber, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['telemetry', 'cache_metadata'], 'readwrite');
            const telemetryStore = transaction.objectStore('telemetry');
            const metadataStore = transaction.objectStore('cache_metadata');

            // Clear existing data for this session/lap
            const index = telemetryStore.index('session_lap');
            const range = IDBKeyRange.only([sessionId, lapNumber]);
            const clearRequest = index.openCursor(range);

            clearRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // Add new data
                    data.forEach((record, idx) => {
                        telemetryStore.add({
                            ...record,
                            session_id: sessionId,
                            lap_number: lapNumber,
                            id: `${sessionId}_${lapNumber}_${idx}`
                        });
                    });

                    // Update cache metadata
                    const cacheKey = `${sessionId}_${lapNumber !== null ? lapNumber : 'all'}`;
                    metadataStore.put({
                        key: cacheKey,
                        session_id: sessionId,
                        lap_number: lapNumber,
                        cached_at: new Date().toISOString(),
                        record_count: data.length
                    });
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getCachedTelemetryData(sessionId, lapNumber = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['telemetry'], 'readonly');
            const store = transaction.objectStore('telemetry');
            const index = store.index('session_id');
            const request = index.getAll(sessionId);

            request.onsuccess = () => {
                let data = request.result;
                
                if (lapNumber !== null) {
                    data = data.filter(record => record.lap_number === lapNumber);
                }

                // Sort by timestamp
                data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                resolve(data);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async isCached(sessionId, lapNumber = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache_metadata'], 'readonly');
            const store = transaction.objectStore('cache_metadata');
            const cacheKey = `${sessionId}_${lapNumber !== null ? lapNumber : 'all'}`;
            const request = store.get(cacheKey);

            request.onsuccess = () => resolve(request.result !== undefined);
            request.onerror = () => reject(request.error);
        });
    }

    async clearCache() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions', 'telemetry', 'cache_metadata'], 'readwrite');
            
            transaction.objectStore('sessions').clear();
            transaction.objectStore('telemetry').clear();
            transaction.objectStore('cache_metadata').clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

