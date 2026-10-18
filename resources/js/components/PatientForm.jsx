import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { listHouseholds, saveHousehold, savePatient } from '../services/ehrService';

const blankPatient = {
    first_name: '', middle_name: '', last_name: '', suffix: '', date_of_birth: '', sex_at_birth: 'unknown',
    philhealth_id: '', contact_number: '', guardian_name: '', guardian_relationship: '', guardian_contact_number: '',
    is_household_head: false,
};
const blankAddress = { region: '', province: '', city_municipality: '', barangay: '', purok_sitio: '', street: '', house_number: '', postal_code: '', contact_number: '' };

export function PatientForm({ initialPatient = null, onSaved, onCancel }) {
    const [form, setForm] = useState(blankPatient);
    const [householdUuid, setHouseholdUuid] = useState('');
    const [createHousehold, setCreateHousehold] = useState(false);
    const [address, setAddress] = useState(blankAddress);
    const [savedPatient, setSavedPatient] = useState(null);
    const [error, setError] = useState('');
    const households = useQuery({ queryKey: ['households'], queryFn: listHouseholds });

    useEffect(() => {
        if (!initialPatient) {
            setForm(blankPatient);
            setHouseholdUuid('');
            setSavedPatient(null);
            return;
        }
        setForm({ ...blankPatient, ...initialPatient, date_of_birth: String(initialPatient.date_of_birth || '').slice(0, 10) });
        setHouseholdUuid(initialPatient.household_uuid || initialPatient.household?.household_uuid || '');
        setSavedPatient(null);
    }, [initialPatient]);

    function setField(key, value) { setForm((current) => ({ ...current, [key]: value })); }
    function setAddressField(key, value) { setAddress((current) => ({ ...current, [key]: value })); }

    async function submit(event) {
        event.preventDefault();
        setError('');
        try {
            let selectedHousehold = householdUuid;
            if (createHousehold) {
                if (!address.barangay.trim()) throw new Error('Enter the household barangay.');
                const household = await saveHousehold(address);
                selectedHousehold = household.household_uuid;
            }
            const patient = await savePatient(form, {
                householdUuid: selectedHousehold || null,
                operation: initialPatient ? 'update' : 'create',
                baseUpdatedAt: initialPatient?.updated_at || null,
            });
            setSavedPatient(patient);
            onSaved?.(patient);
        } catch (reason) {
            setError(reason.response?.data?.message || reason.message || 'Could not save the patient record.');
        }
    }

    if (savedPatient) {
        const qrPayload = `BHC:patient:${savedPatient.patient_uuid}`;
        return (
            <section className="rounded-3xl border border-teal-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Health card ready</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{savedPatient.first_name} {savedPatient.last_name}</h2><p className="mt-1 text-sm text-slate-600">Patient ID: <strong>{savedPatient.patient_number}</strong></p></div>
                    <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Print card</button>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-6 rounded-2xl bg-slate-50 p-5 print:border print:border-slate-300">
                    <div className="rounded-xl bg-white p-3"><QRCodeSVG value={qrPayload} size={132} level="M" /></div>
                    <div><p className="font-semibold text-slate-900">Scan to look up this patient</p><p className="mt-1 max-w-md break-all text-xs text-slate-500">{qrPayload}</p><p className="mt-3 text-sm text-slate-600">Keep this health card private. It contains a patient identifier.</p></div>
                </div>
                <div className="mt-5 flex gap-3"><button type="button" onClick={() => { setSavedPatient(null); setForm(blankPatient); }} className="rounded-xl bg-teal-800 px-4 py-2 font-semibold text-white">Register another</button><button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">Close</button></div>
            </section>
        );
    }

    const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100';
    const labelClass = 'block text-sm font-medium text-slate-700';
    return (
        <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Patient Master Index</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{initialPatient ? 'Update patient' : 'Register patient'}</h2></div>{onCancel && <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>}</div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <section><h3 className="mb-3 font-semibold text-slate-900">Personal details</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className={labelClass}>First name<input required maxLength="100" className={inputClass} value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} /></label>
                <label className={labelClass}>Middle name<input maxLength="100" className={inputClass} value={form.middle_name || ''} onChange={(e) => setField('middle_name', e.target.value)} /></label>
                <label className={labelClass}>Last name<input required maxLength="100" className={inputClass} value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} /></label>
                <label className={labelClass}>Extension<input placeholder="Jr., Sr., III" maxLength="20" className={inputClass} value={form.suffix || ''} onChange={(e) => setField('suffix', e.target.value)} /></label>
                <label className={labelClass}>Birthdate<input required type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} value={form.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} /></label>
                <label className={labelClass}>Sex at birth<select className={inputClass} value={form.sex_at_birth} onChange={(e) => setField('sex_at_birth', e.target.value)}><option value="unknown">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option></select></label>
                <label className={labelClass}>PhilHealth ID<input maxLength="30" className={inputClass} value={form.philhealth_id || ''} onChange={(e) => setField('philhealth_id', e.target.value)} /></label>
                <label className={labelClass}>Contact number<input type="tel" maxLength="30" className={inputClass} value={form.contact_number || ''} onChange={(e) => setField('contact_number', e.target.value)} /></label>
            </div></section>
            <section><h3 className="mb-3 font-semibold text-slate-900">Household & guardian</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>Link household<select disabled={createHousehold} className={inputClass} value={householdUuid} onChange={(e) => setHouseholdUuid(e.target.value)}><option value="">No household selected</option>{(households.data || []).map((home) => <option key={home.household_uuid} value={home.household_uuid}>{home.household_code} · {home.purok_sitio || home.barangay} {home.street ? `· ${home.street}` : ''}</option>)}</select></label>
                    <label className="flex items-center gap-3 self-end rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={form.is_household_head} onChange={(e) => setField('is_household_head', e.target.checked)} />This patient is the household head</label>
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-medium text-teal-800"><input type="checkbox" checked={createHousehold} onChange={(e) => { setCreateHousehold(e.target.checked); if (e.target.checked) setHouseholdUuid(''); }} />Create a new household profile</label>
                {createHousehold && <div className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={labelClass}>Region<input className={inputClass} value={address.region} onChange={(e) => setAddressField('region', e.target.value)} /></label>
                    <label className={labelClass}>Province<input className={inputClass} value={address.province} onChange={(e) => setAddressField('province', e.target.value)} /></label>
                    <label className={labelClass}>City / municipality<input className={inputClass} value={address.city_municipality} onChange={(e) => setAddressField('city_municipality', e.target.value)} /></label>
                    <label className={labelClass}>Barangay<input required className={inputClass} value={address.barangay} onChange={(e) => setAddressField('barangay', e.target.value)} /></label>
                    <label className={labelClass}>Purok / sitio<input className={inputClass} value={address.purok_sitio} onChange={(e) => setAddressField('purok_sitio', e.target.value)} /></label>
                    <label className={labelClass}>Street<input className={inputClass} value={address.street} onChange={(e) => setAddressField('street', e.target.value)} /></label>
                    <label className={labelClass}>House number<input className={inputClass} value={address.house_number} onChange={(e) => setAddressField('house_number', e.target.value)} /></label>
                    <label className={labelClass}>Household contact<input type="tel" className={inputClass} value={address.contact_number} onChange={(e) => setAddressField('contact_number', e.target.value)} /></label>
                </div>}
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className={labelClass}>Parent / guardian<input className={inputClass} value={form.guardian_name || ''} onChange={(e) => setField('guardian_name', e.target.value)} /></label>
                    <label className={labelClass}>Relationship<input className={inputClass} value={form.guardian_relationship || ''} onChange={(e) => setField('guardian_relationship', e.target.value)} /></label>
                    <label className={labelClass}>Guardian phone<input type="tel" className={inputClass} value={form.guardian_contact_number || ''} onChange={(e) => setField('guardian_contact_number', e.target.value)} /></label>
                </div>
            </section>
            <button className="rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900">{initialPatient ? 'Save patient changes' : 'Save patient offline / online'}</button>
            <p className="text-xs leading-5 text-slate-500">The record is written to this device first. It will sync when a connection is available. Avoid recording duplicate patients; patient data is sensitive health information.</p>
        </form>
    );
}
