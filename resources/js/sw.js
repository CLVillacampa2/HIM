import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Keep PHI-bearing API responses out of Cache Storage. Only cache static shell assets.
registerRoute(({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination), new CacheFirst({ cacheName: 'ehr-static-v1' }));
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({
    cacheName: 'ehr-shell-v1',
    networkTimeoutSeconds: 3,
    plugins: [{ async handlerDidError() { return (await caches.match('/offline.html')) || Response.error(); } }],
}));

const DB_NAME = 'barangay-health-center-ehr';
const API_BASE = import.meta.env.VITE_API_BASE_URL || `${self.location.origin}/api/v1`;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
}

async function readSetting(database, key) {
    const transaction = database.transaction('settings', 'readonly');
    const value = await requestResult(transaction.objectStore('settings').get(key));
    await transactionDone(transaction);
    return value?.value ?? null;
}

async function notifyClients(message) {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage(message));
}

async function syncQueue() {
    const database = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(DB_NAME);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
        opening.onupgradeneeded = () => reject(new Error('EHR database has not been initialized by the app yet'));
    });

    try {
        const [token, device] = await Promise.all([readSetting(database, 'api_token'), readSetting(database, 'device_id')]);
        if (!token || !device) return;

        const read = database.transaction('sync_queue', 'readonly');
        const queued = await requestResult(read.objectStore('sync_queue').index('status').getAll('pending_sync'));
        await transactionDone(read);
        queued.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

        for (let offset = 0; offset < queued.length; offset += 100) {
            const batch = queued.slice(offset, offset + 100);
            const response = await fetch(`${API_BASE}/sync`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    device_id: device,
                    transactions: batch.map(({ transaction_id, local_id, entity_type, operation, entity_id, base_updated_at, payload }) => ({
                        transaction_id, local_id, entity_type, operation, entity_id, base_updated_at, payload,
                    })),
                }),
            });
            if (!response.ok) throw new Error(`Sync returned HTTP ${response.status}`);
            const data = await response.json();
            const byTransaction = new Map((data.results || []).map((result) => [result.transaction_id, result]));

            for (const item of batch) {
                const result = byTransaction.get(item.transaction_id);
                if (!result) continue;
                const storeName = { household: 'households', patient: 'patients', immunization: 'immunization_records', encounter: 'clinical_encounters' }[item.entity_type];
                const keyName = { household: 'household_uuid', patient: 'patient_uuid', immunization: 'client_record_id', encounter: 'client_encounter_id' }[item.entity_type];
                const transaction = database.transaction(['sync_queue', storeName], 'readwrite');
                const queueStore = transaction.objectStore('sync_queue');
                const entityStore = transaction.objectStore(storeName);

                if (result.status === 'synced' || result.status === 'duplicate') {
                    const entity = await requestResult(entityStore.index(keyName).get(item.entity_id || item.local_id));
                    if (entity) entityStore.put({ ...entity, sync_status: 'synced', server_updated_at: result.server_updated_at || null });
                    queueStore.delete(item.id);
                } else if (result.status === 'conflict' || result.status === 'rejected') {
                    const entity = await requestResult(entityStore.index(keyName).get(item.entity_id || item.local_id));
                    if (result.status === 'conflict' && result.server_record) {
                        entityStore.put({ ...(entity || {}), ...result.server_record, sync_status: 'synced' });
                        queueStore.delete(item.id);
                    } else {
                        queueStore.put({ ...item, status: result.status, last_error: result.errors || null });
                        if (entity) entityStore.put({ ...entity, sync_status: result.status });
                    }
                } else {
                    queueStore.put({ ...item, attempts: (item.attempts || 0) + 1, last_attempt_at: new Date().toISOString() });
                }
                await transactionDone(transaction);
            }
        }

        await notifyClients({ type: 'EHR_SYNC_COMPLETE' });
    } finally {
        database.close();
    }
}

self.addEventListener('sync', (event) => {
    if (event.tag === 'ehr-sync-queue') event.waitUntil(syncQueue());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'EHR_SYNC_NOW') event.waitUntil(syncQueue());
});
