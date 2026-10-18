import Dexie from 'dexie';

export const db = new Dexie('barangay-health-center-ehr');

db.version(1).stores({
    households: '++local_pk,&household_uuid,&household_code,barangay,purok_sitio,updated_at,sync_status',
    patients: '++local_pk,&patient_uuid,&patient_number,household_uuid,last_name,first_name,date_of_birth,updated_at,sync_status',
    vaccine_schedules: '&id,&[vaccine_code+dose_number],vaccine_code,recommended_age_days',
    immunization_records: '++local_pk,&client_record_id,patient_uuid,vaccine_schedule_id,administered_at,sync_status',
    clinical_encounters: '++local_pk,&client_encounter_id,patient_uuid,encountered_at,sync_status',
    icd10_codes: '&id,&code,description,category,is_active',
    sync_queue: '++id,&transaction_id,local_id,entity_type,status,created_at,[status+created_at]',
    settings: '&key',
});

function makeUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.random() * 16 | 0;
        return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    });
}

export async function getSetting(key) {
    return (await db.settings.get(key))?.value ?? null;
}

export async function setSetting(key, value) {
    await db.settings.put({ key, value });
}

export async function getDeviceId() {
    let deviceId = await getSetting('device_id');
    if (!deviceId) {
        deviceId = makeUuid();
        await setSetting('device_id', deviceId);
    }
    return deviceId;
}

export async function queueMutation({ entityType, operation = 'create', entityId, localId, payload, baseUpdatedAt = null }) {
    if (operation === 'update') {
        const unsyncedCreate = await db.sync_queue
            .where('local_id').equals(String(localId))
            .filter((item) => item.entity_type === entityType && item.operation === 'create' && item.status === 'pending_sync')
            .first();
        if (unsyncedCreate) {
            await db.sync_queue.update(unsyncedCreate.id, { payload, updated_at: new Date().toISOString() });
            globalThis.dispatchEvent?.(new CustomEvent('ehr-queue-updated'));
            return unsyncedCreate.transaction_id;
        }
    }

    const transactionId = makeUuid();
    const createdAt = new Date().toISOString();

    await db.sync_queue.add({
        transaction_id: transactionId,
        local_id: String(localId),
        entity_type: entityType,
        operation,
        entity_id: entityId ?? null,
        base_updated_at: baseUpdatedAt,
        payload,
        status: 'pending_sync',
        attempts: 0,
        created_at: createdAt,
    });

    globalThis.dispatchEvent?.(new CustomEvent('ehr-queue-updated'));
    if (navigator.onLine && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => registration.sync?.register('ehr-sync-queue')).catch(() => {});
    }

    return transactionId;
}

export async function pendingSyncCount() {
    return db.sync_queue.where('status').equals('pending_sync').count();
}

export async function syncAttentionCount() {
    const [conflicts, rejected] = await Promise.all([
        db.sync_queue.where('status').equals('conflict').count(),
        db.sync_queue.where('status').equals('rejected').count(),
    ]);
    return conflicts + rejected;
}

export { makeUuid };
