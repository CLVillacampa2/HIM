import apiClient from './apiClient';
import { db, getDeviceId, getSetting, pendingSyncCount } from '../db';

let running = null;

function emitQueueChange() {
    globalThis.dispatchEvent?.(new CustomEvent('ehr-queue-updated'));
}

async function markLocalSynced(item, result) {
    const tableName = {
        household: 'households',
        patient: 'patients',
        immunization: 'immunization_records',
        encounter: 'clinical_encounters',
    }[item.entity_type];
    const table = db.table(tableName);
    const keyField = {
        household: 'household_uuid',
        patient: 'patient_uuid',
        immunization: 'client_record_id',
        encounter: 'client_encounter_id',
    }[item.entity_type];
    const row = await table.where(keyField).equals(item.entity_id || item.local_id).first();
    if (row) {
        await table.put({ ...row, sync_status: 'synced', server_updated_at: result.server_updated_at || null });
    }
}

export async function syncPendingQueue() {
    if (running) return running;
    if (!navigator.onLine || !(await getSetting('api_token'))) return { synced: 0, pending: await pendingSyncCount() };

    running = (async () => {
        let synced = 0;
        const deviceId = await getDeviceId();
        const attempted = new Set();

        while (true) {
            const candidates = await db.sync_queue.where('status').equals('pending_sync').sortBy('created_at');
            const chunk = candidates.filter((item) => !attempted.has(item.transaction_id)).slice(0, 100);
            if (!chunk.length) break;
            chunk.forEach((item) => attempted.add(item.transaction_id));
            const payload = {
                device_id: deviceId,
                transactions: chunk.map((item) => ({
                    transaction_id: item.transaction_id,
                    local_id: item.local_id,
                    entity_type: item.entity_type,
                    operation: item.operation,
                    entity_id: item.entity_id,
                    base_updated_at: item.base_updated_at,
                    payload: item.payload,
                })),
            };

            try {
                const { data } = await apiClient.post('/sync', payload);
                const byTransaction = new Map((data.results || []).map((result) => [result.transaction_id, result]));
                for (const item of chunk) {
                    const result = byTransaction.get(item.transaction_id);
                    if (!result) continue;
                    if (result.status === 'synced' || result.status === 'duplicate') {
                        await markLocalSynced(item, result);
                        await db.sync_queue.delete(item.id);
                        synced += 1;
                    } else if (result.status === 'conflict' || result.status === 'rejected') {
                        const table = db.table({ household: 'households', patient: 'patients', immunization: 'immunization_records', encounter: 'clinical_encounters' }[item.entity_type]);
                        const keyField = { household: 'household_uuid', patient: 'patient_uuid', immunization: 'client_record_id', encounter: 'client_encounter_id' }[item.entity_type];
                        const row = await table.where(keyField).equals(item.entity_id || item.local_id).first();
                        if (result.status === 'conflict' && result.server_record) {
                            await table.put({ ...(row || {}), ...result.server_record, sync_status: 'synced' });
                            await db.sync_queue.delete(item.id);
                            synced += 1;
                        } else {
                            await db.sync_queue.update(item.id, { status: result.status, last_error: result.errors || null });
                            if (row) await table.put({ ...row, sync_status: result.status });
                        }
                    } else {
                        await db.sync_queue.update(item.id, { attempts: (item.attempts || 0) + 1, last_attempt_at: new Date().toISOString() });
                    }
                }
            } catch (error) {
                for (const item of chunk) {
                    await db.sync_queue.update(item.id, {
                        attempts: (item.attempts || 0) + 1,
                        last_attempt_at: new Date().toISOString(),
                        last_error: error.response?.data?.message || 'Network or server error',
                    });
                }
                if (!navigator.onLine || error.response) throw error;
                break;
            }
        }

        const pending = await pendingSyncCount();
        emitQueueChange();
        return { synced, pending };
    })().finally(() => {
        running = null;
        emitQueueChange();
    });

    return running;
}

export async function queueCount() {
    return pendingSyncCount();
}
