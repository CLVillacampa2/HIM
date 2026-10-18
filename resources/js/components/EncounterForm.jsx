import { useEffect, useState } from 'react';
import { saveEncounter, searchIcd10 } from '../services/ehrService';

const initial = { chief_complaint: '', clinical_notes: '', temperature_celsius: '', systolic_bp: '', diastolic_bp: '', pulse_rate: '', respiratory_rate: '', oxygen_saturation: '', weight_kg: '', height_cm: '', follow_up_at: '' };
const numericFields = ['temperature_celsius', 'systolic_bp', 'diastolic_bp', 'pulse_rate', 'respiratory_rate', 'oxygen_saturation', 'weight_kg', 'height_cm'];

export function EncounterForm({ patient }) {
    const [form, setForm] = useState(initial);
    const [term, setTerm] = useState('');
    const [matches, setMatches] = useState([]);
    const [diagnoses, setDiagnoses] = useState([]);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(async () => {
            if (term.trim().length < 2) { setMatches([]); return; }
            try {
                const results = await searchIcd10(term);
                if (active) setMatches(results);
            } catch {
                if (active) setMatches([]);
            }
        }, 250);
        return () => { active = false; window.clearTimeout(timer); };
    }, [term]);

    function addDiagnosis(code) {
        if (diagnoses.some((item) => item.icd10_code_id === code.id)) return;
        setDiagnoses((current) => [...current, { icd10_code_id: code.id, code: code.code, description: code.description, is_primary: current.length === 0 }]);
        setTerm('');
        setMatches([]);
    }

    async function submit(event) {
        event.preventDefault();
        if (!patient) return;
        setBusy(true); setError(''); setSaved(false);
        try {
            const clean = { ...form };
            for (const key of numericFields) clean[key] = clean[key] === '' ? null : Number(clean[key]);
            clean.encounter_type = 'consultation';
            clean.encountered_at = new Date().toISOString();
            clean.follow_up_at = clean.follow_up_at ? new Date(`${clean.follow_up_at}T00:00:00`).toISOString() : null;
            await saveEncounter(patient, clean, diagnoses.map(({ icd10_code_id, is_primary }) => ({ icd10_code_id, is_primary })));
            setForm(initial); setDiagnoses([]); setSaved(true);
        } catch (reason) {
            setError(reason.response?.data?.message || reason.message || 'Encounter could not be saved.');
        } finally {
            setBusy(false);
        }
    }

    if (!patient) return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Select a patient before creating a consultation.</div>;
    const label = 'block text-sm font-medium text-slate-700';
    const input = 'mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100';
    return (
        <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Clinical encounter</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Consultation for {patient.first_name} {patient.last_name}</h2><p className="mt-1 text-sm text-slate-500">Saved locally first; ICD-10 diagnosis selection works from the downloaded catalog while offline.</p></div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Encounter saved on this device and added to the sync queue.</p>}
            <section><h3 className="mb-3 font-semibold text-slate-900">Vital signs</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className={label}>Blood pressure (systolic)<input type="number" min="40" max="300" className={input} value={form.systolic_bp} onChange={(e) => setForm((current) => ({ ...current, systolic_bp: e.target.value }))} /></label>
                <label className={label}>Blood pressure (diastolic)<input type="number" min="20" max="200" className={input} value={form.diastolic_bp} onChange={(e) => setForm((current) => ({ ...current, diastolic_bp: e.target.value }))} /></label>
                <label className={label}>Pulse / min<input type="number" min="20" max="250" className={input} value={form.pulse_rate} onChange={(e) => setForm((current) => ({ ...current, pulse_rate: e.target.value }))} /></label>
                <label className={label}>Temperature °C<input type="number" min="25" max="45" step="0.1" className={input} value={form.temperature_celsius} onChange={(e) => setForm((current) => ({ ...current, temperature_celsius: e.target.value }))} /></label>
                <label className={label}>Respiratory rate<input type="number" min="5" max="100" className={input} value={form.respiratory_rate} onChange={(e) => setForm((current) => ({ ...current, respiratory_rate: e.target.value }))} /></label>
                <label className={label}>Oxygen saturation %<input type="number" min="0" max="100" step="0.1" className={input} value={form.oxygen_saturation} onChange={(e) => setForm((current) => ({ ...current, oxygen_saturation: e.target.value }))} /></label>
                <label className={label}>Weight kg<input type="number" min="0.1" max="500" step="0.01" className={input} value={form.weight_kg} onChange={(e) => setForm((current) => ({ ...current, weight_kg: e.target.value }))} /></label>
                <label className={label}>Height cm<input type="number" min="20" max="250" step="0.1" className={input} value={form.height_cm} onChange={(e) => setForm((current) => ({ ...current, height_cm: e.target.value }))} /></label>
            </div></section>
            <section className="grid gap-4 sm:grid-cols-2"><label className={label}>Chief complaint<textarea rows="3" maxLength="500" className={input} value={form.chief_complaint} onChange={(e) => setForm((current) => ({ ...current, chief_complaint: e.target.value }))} /></label><label className={label}>Clinical notes<textarea rows="3" maxLength="10000" className={input} value={form.clinical_notes} onChange={(e) => setForm((current) => ({ ...current, clinical_notes: e.target.value }))} /></label></section>
            <section><h3 className="mb-3 font-semibold text-slate-900">ICD-10 diagnosis</h3><div className="relative"><label className="sr-only" htmlFor="icd-search">Search ICD-10</label><input id="icd-search" autoComplete="off" placeholder="Search by code or diagnosis (e.g. hypertension)" className={input} value={term} onChange={(e) => setTerm(e.target.value)} />{matches.length > 0 && <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">{matches.map((code) => <li key={code.id}><button type="button" onClick={() => addDiagnosis(code)} className="w-full px-4 py-3 text-left hover:bg-teal-50"><span className="font-bold text-teal-800">{code.code}</span><span className="ml-3 text-sm text-slate-800">{code.description}</span><span className="ml-2 text-xs text-slate-400">{code.category}</span></button></li>)}</ul>}</div>
                {diagnoses.length > 0 && <div className="mt-3 space-y-2">{diagnoses.map((diagnosis) => <div key={diagnosis.icd10_code_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><strong className="text-teal-800">{diagnosis.code}</strong><span className="ml-2 text-sm">{diagnosis.description}</span>{diagnosis.is_primary && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">Primary</span>}</div><div className="flex gap-2"><button type="button" onClick={() => setDiagnoses((current) => current.map((item) => ({ ...item, is_primary: item.icd10_code_id === diagnosis.icd10_code_id })))} className="text-xs font-semibold text-teal-800">Set primary</button><button type="button" onClick={() => setDiagnoses((current) => current.filter((item) => item.icd10_code_id !== diagnosis.icd10_code_id).map((item, index) => ({ ...item, is_primary: index === 0 && item.is_primary })))} className="text-xs font-semibold text-rose-700">Remove</button></div></div>)}</div>}
            </section>
            <div className="flex flex-wrap items-end justify-between gap-4"><label className={label}>Follow-up date (optional)<input type="date" className={input} value={form.follow_up_at} onChange={(e) => setForm((current) => ({ ...current, follow_up_at: e.target.value }))} /></label><button disabled={busy} className="rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900 disabled:opacity-50">{busy ? 'Saving…' : 'Save encounter offline / online'}</button></div>
        </form>
    );
}
