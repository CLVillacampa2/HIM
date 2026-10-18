import apiClient from './apiClient';
import { db, getSetting, makeUuid, queueMutation, setSetting } from '../db';

const byUpdated = (rows) => rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

async function fetchAllPages(path) {
    const records = [];
    let page = 1;
    let lastPage = 1;
    do {
        const { data } = await apiClient.get(path, { params: { page, per_page: 100 } });
        records.push(...(data.data || []));
        lastPage = Number(data.last_page || 1);
        page += 1;
    } while (page <= lastPage);
    return records;
}

export async function signIn({ email, password, deviceName }) {
    const { data } = await apiClient.post('/auth/token', {
        email,
        password,
        device_name: deviceName || `BHW tablet ${navigator.userAgent.slice(0, 40)}`,
    });
    await setSetting('api_token', data.token);
    await setSetting('current_user', data.user);
    return data.user;
}

export async function signOut() {
    try {
        await apiClient.post('/auth/logout');
    } catch {
        // Local logout must still work without connectivity.
    }
    await db.settings.bulkDelete(['api_token', 'current_user']);
}

export async function hasSession() {
    return Boolean(await getSetting('api_token'));
}

export async function currentUser() {
    return getSetting('current_user');
}

export async function refreshReferenceData() {
    if (!navigator.onLine || !(await hasSession())) return;

    const [households, patients, schedulesResponse, codesResponse] = await Promise.all([
        fetchAllPages('/households'),
        fetchAllPages('/patients'),
        apiClient.get('/vaccine-schedules'),
        apiClient.get('/icd10/catalog'),
    ]);

    await db.transaction('rw', db.households, db.patients, db.vaccine_schedules, db.icd10_codes, async () => {
        const schedules = schedulesResponse.data.data || [];
        const codes = codesResponse.data.data || [];

        for (const household of households) {
            const existing = await db.households.where('household_uuid').equals(household.household_uuid).first();
            await db.households.put({ ...existing, ...household, sync_status: 'synced' });
        }
        for (const patient of patients) {
            const existing = await db.patients.where('patient_uuid').equals(patient.patient_uuid).first();
            await db.patients.put({ ...existing, ...patient, household_uuid: patient.household?.household_uuid ?? existing?.household_uuid, sync_status: 'synced' });
        }
        await db.vaccine_schedules.bulkPut(schedules);
        await db.icd10_codes.bulkPut(codes.map((code) => ({ ...code, is_active: true })));
    });
}

export async function listPatients(query = '') {
    if (navigator.onLine && await hasSession()) {
        try {
            const { data } = await apiClient.get('/patients', { params: { q: query || undefined, per_page: 100 } });
            for (const patient of data.data || []) {
                const queuedDelete = await db.sync_queue.where('local_id').equals(patient.patient_uuid)
                    .filter((item) => item.entity_type === 'patient' && item.operation === 'delete' && ['pending_sync', 'rejected', 'conflict'].includes(item.status))
                    .first();
                if (queuedDelete) continue;
                const existing = await db.patients.where('patient_uuid').equals(patient.patient_uuid).first();
                await db.patients.put({ ...existing, ...patient, household_uuid: patient.household?.household_uuid ?? existing?.household_uuid, sync_status: 'synced' });
            }
        } catch (error) {
            console.info('Using locally cached patient index.', error.message);
        }
    }

    let patients = byUpdated(await db.patients.toArray());
    if (query.trim()) {
        const term = query.toLocaleLowerCase();
        patients = patients.filter((patient) => [patient.patient_number, patient.first_name, patient.middle_name, patient.last_name, patient.contact_number]
            .some((value) => String(value || '').toLocaleLowerCase().includes(term)));
    }
    return patients;
}

export async function listHouseholds() {
    if (navigator.onLine && await hasSession()) {
        try {
            const { data } = await apiClient.get('/households', { params: { per_page: 100 } });
            for (const household of data.data || []) {
                const existing = await db.households.where('household_uuid').equals(household.household_uuid).first();
                await db.households.put({ ...existing, ...household, sync_status: 'synced' });
            }
        } catch (error) {
            console.info('Using locally cached household index.', error.message);
        }
    }
    return byUpdated(await db.households.toArray());
}

export async function saveHousehold(input) {
    const householdUuid = input.household_uuid || makeUuid();
    const now = new Date().toISOString();
    const household = {
        ...input,
        household_uuid: householdUuid,
        household_code: input.household_code || `HH-${householdUuid.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        updated_at: now,
        sync_status: 'pending_sync',
    };
    const existing = await db.households.where('household_uuid').equals(householdUuid).first();
    await db.households.put({ ...existing, ...household });
    await queueMutation({
        entityType: 'household',
        operation: 'create',
        entityId: householdUuid,
        localId: householdUuid,
        payload: household,
    });
    return household;
}

export async function savePatient(input, { householdUuid = null, operation = 'create', baseUpdatedAt = null } = {}) {
    const patientUuid = input.patient_uuid || makeUuid();
    const qrToken = input.qr_code_token || makeUuid();
    const now = new Date().toISOString();
    const patient = {
        ...input,
        patient_uuid: patientUuid,
        patient_number: input.patient_number || `BHC-${patientUuid.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        qr_code_token: qrToken,
        household_uuid: householdUuid || input.household_uuid || null,
        household_id: input.household_id || null,
        is_household_head: Boolean(input.is_household_head),
        updated_at: now,
        sync_status: 'pending_sync',
    };
    const existing = await db.patients.where('patient_uuid').equals(patientUuid).first();
    await db.patients.put({ ...existing, ...patient });
    await queueMutation({
        entityType: 'patient',
        operation,
        entityId: patientUuid,
        localId: patientUuid,
        baseUpdatedAt,
        payload: { ...patient, household_id: undefined, household: undefined },
    });
    return patient;
}

export async function archivePatient(patient) {
    const pendingItems = await db.sync_queue.where('local_id').equals(patient.patient_uuid).toArray();
    const unsyncedCreate = pendingItems.find((item) => item.entity_type === 'patient' && item.operation === 'create' && item.status === 'pending_sync');
    const queueItem = {
        transaction_id: makeUuid(),
        local_id: patient.patient_uuid,
        entity_type: 'patient',
        operation: 'delete',
        entity_id: patient.patient_uuid,
        base_updated_at: patient.server_updated_at || patient.updated_at || null,
        payload: { patient_uuid: patient.patient_uuid },
        status: 'pending_sync',
        attempts: 0,
        created_at: new Date().toISOString(),
    };

    await db.transaction('rw', db.patients, db.sync_queue, async () => {
        if (unsyncedCreate) {
            for (const item of pendingItems) {
                if (item.entity_type === 'patient' && item.status === 'pending_sync') await db.sync_queue.delete(item.id);
            }
        } else {
            for (const item of pendingItems) {
                if (item.entity_type === 'patient' && item.status === 'pending_sync') await db.sync_queue.delete(item.id);
            }
            await db.sync_queue.add(queueItem);
        }
        await db.patients.where('patient_uuid').equals(patient.patient_uuid).delete();
    });

    globalThis.dispatchEvent?.(new CustomEvent('ehr-queue-updated'));
    if (!unsyncedCreate && navigator.onLine && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => registration.sync?.register('ehr-sync-queue')).catch(() => {});
    }
}

export async function getPatientSchedule(patient) {
    if (navigator.onLine && await hasSession()) {
        try {
            const { data } = await apiClient.get(`/patients/${patient.patient_uuid}/immunizations/schedule`);
            for (const dose of data.schedule || []) {
                if (!dose.record?.client_record_id) continue;
                const existing = await db.immunization_records.where('client_record_id').equals(dose.record.client_record_id).first();
                await db.immunization_records.put({
                    ...existing,
                    client_record_id: dose.record.client_record_id,
                    patient_uuid: patient.patient_uuid,
                    vaccine_schedule_id: dose.schedule_id,
                    administered_at: dose.record.administered_at,
                    lot_number: dose.record.lot_number,
                    sync_status: 'synced',
                });
            }
            return data.schedule;
        } catch (error) {
            console.info('Using locally calculated immunization schedule.', error.message);
        }
    }

    const [allDoses, records] = await Promise.all([
        db.vaccine_schedules.toArray(),
        db.immunization_records.where('patient_uuid').equals(patient.patient_uuid).toArray(),
    ]);
    const doses = allDoses.filter((dose) => dose.is_active !== false);
    const birthDate = new Date(`${String(patient.date_of_birth).slice(0, 10)}T00:00:00Z`);
    const dateKey = (date) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
    const todayKey = dateKey(new Date());

    return doses.sort((a, b) => a.recommended_age_days - b.recommended_age_days || a.vaccine_code.localeCompare(b.vaccine_code) || a.dose_number - b.dose_number).map((dose) => {
        const addDaysTo = (startDate, days) => {
            const date = new Date(`${startDate}T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() + Number(days));
            return date.toISOString().slice(0, 10);
        };
        const addDays = (days) => addDaysTo(String(patient.date_of_birth).slice(0, 10), days);
        const addMonths = (months) => {
            const date = new Date(birthDate);
            const day = date.getUTCDate();
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() + Number(months));
            const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
            date.setUTCDate(Math.min(day, lastDay));
            return date.toISOString().slice(0, 10);
        };
        const record = records.filter((item) => Number(item.vaccine_schedule_id) === Number(dose.id))
            .sort((a, b) => String(a.administered_at).localeCompare(String(b.administered_at)))[0];
        const previousDose = doses.find((item) => item.vaccine_code === dose.vaccine_code && Number(item.dose_number) === Number(dose.dose_number) - 1);
        const previousRecords = previousDose && records.filter((item) => Number(item.vaccine_schedule_id) === Number(previousDose.id))
            .sort((a, b) => String(a.administered_at).localeCompare(String(b.administered_at)));
        const previousRecord = previousRecords?.at(-1);
        const baseDueDate = dose.recommended_age_months ? addMonths(dose.recommended_age_months) : addDays(dose.recommended_age_days);
        const intervalDueDate = previousRecord && dose.minimum_interval_days
            ? addDaysTo(String(previousRecord.administered_at).slice(0, 10), dose.minimum_interval_days)
            : baseDueDate;
        const dueDate = intervalDueDate > baseDueDate ? intervalDueDate : baseDueDate;
        const minimumAgeDate = dose.recommended_age_months ? baseDueDate : addDays(dose.earliest_age_days || 0);
        const windowStart = dueDate > minimumAgeDate ? dueDate : minimumAgeDate;
        const windowEnd = addDaysTo(dueDate, 30);
        const status = record ? 'completed' : todayKey < windowStart ? 'upcoming' : todayKey > windowEnd ? 'overdue' : 'due_today';
        return {
            schedule_id: dose.id,
            vaccine_code: dose.vaccine_code,
            vaccine_name: dose.vaccine_name,
            dose_number: dose.dose_number,
            dose_label: dose.dose_label,
            due_date: dueDate,
            window_start: windowStart,
            window_end: windowEnd,
            status,
            record: record || null,
        };
    });
}

export async function saveImmunization(patient, dose, details = {}) {
    const clientRecordId = makeUuid();
    const administeredAt = details.administered_at || new Date().toISOString();
    const record = {
        ...details,
        client_record_id: clientRecordId,
        patient_uuid: patient.patient_uuid,
        vaccine_schedule_id: dose.schedule_id,
        administered_at: administeredAt,
        sync_status: 'pending_sync',
    };
    await db.immunization_records.add(record);
    await queueMutation({
        entityType: 'immunization',
        operation: 'create',
        entityId: clientRecordId,
        localId: clientRecordId,
        payload: record,
    });
    return record;
}

export async function searchIcd10(term) {
    const query = term.trim();
    if (!query) return [];
    if (navigator.onLine && await hasSession()) {
        try {
            const { data } = await apiClient.get('/icd10', { params: { q: query } });
            await db.icd10_codes.bulkPut(data.data.map((code) => ({ ...code, is_active: true })));
            return data.data;
        } catch (error) {
            console.info('Using locally cached ICD-10 catalog.', error.message);
        }
    }
    const lowered = query.toLocaleLowerCase();
    return (await db.icd10_codes.toArray())
        .filter((code) => `${code.code} ${code.description} ${code.category || ''}`.toLocaleLowerCase().includes(lowered))
        .slice(0, 20);
}

export async function saveEncounter(patient, input, diagnoses = []) {
    const encounterId = input.client_encounter_id || makeUuid();
    const encounter = {
        ...input,
        client_encounter_id: encounterId,
        patient_uuid: patient.patient_uuid,
        encountered_at: input.encountered_at || new Date().toISOString(),
        diagnoses,
        sync_status: 'pending_sync',
        updated_at: new Date().toISOString(),
    };
    await db.clinical_encounters.add(encounter);
    await queueMutation({
        entityType: 'encounter',
        operation: 'create',
        entityId: encounterId,
        localId: encounterId,
        payload: encounter,
    });
    return encounter;
}
