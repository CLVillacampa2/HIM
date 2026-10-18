import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPatientSchedule, saveImmunization } from '../services/ehrService';
import apiClient from '../services/apiClient';

const statusStyles = {
    completed: 'bg-emerald-100 text-emerald-800',
    due_today: 'bg-amber-100 text-amber-900',
    overdue: 'bg-rose-100 text-rose-800',
    upcoming: 'bg-slate-100 text-slate-700',
};
const statusLabels = { completed: 'Completed', due_today: 'Due Today', overdue: 'Overdue', upcoming: 'Upcoming' };

export function ImmunizationMatrix({ patient }) {
    const client = useQueryClient();
    const [activeDose, setActiveDose] = useState(null);
    const [details, setDetails] = useState({ lot_number: '', administration_site: 'Barangay Health Center', notes: '' });
    const [reminder, setReminder] = useState(null);
    const schedule = useQuery({
        queryKey: ['schedule', patient?.patient_uuid ?? null],
        queryFn: () => getPatientSchedule(patient),
        enabled: Boolean(patient),
    });
    const markDone = useMutation({
        mutationFn: () => saveImmunization(patient, activeDose, details),
        onSuccess: () => {
            setActiveDose(null);
            client.invalidateQueries({ queryKey: ['schedule', patient.patient_uuid] });
        },
    });

    async function prepareReminder() {
        try {
            const { data } = await apiClient.get(`/patients/${patient.patient_uuid}/immunizations/reminder-payload`);
            setReminder(data);
        } catch {
            const pending = (schedule.data || []).filter((dose) => ['due_today', 'overdue'].includes(dose.status));
            const phone = patient.guardian_contact_number || patient.contact_number;
            setReminder({
                sendable: Boolean(phone && pending.length),
                recipient: phone,
                message: pending.length ? `Barangay Health Center reminder: ${patient.guardian_name ? 'your child' : patient.first_name} has a vaccine dose due: ${pending.map((dose) => `${dose.vaccine_name} ${dose.dose_number}`).join(', ')}. Please visit your health center.` : '',
                reason: !phone ? 'No contact number is recorded.' : 'No due or overdue doses.',
            });
        }
    }

    if (!patient) return <EmptyState text="Select a patient to view the immunization schedule." />;
    return (
        <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl bg-gradient-to-r from-teal-900 to-teal-700 p-6 text-white">
                <div><p className="text-xs font-bold uppercase tracking-widest text-teal-100">Childhood immunization</p><h2 className="mt-1 text-2xl font-bold">{patient.first_name} {patient.last_name}</h2><p className="mt-1 text-sm text-teal-100">Born {String(patient.date_of_birth).slice(0, 10)} · Patient ID {patient.patient_number}</p></div>
                <button type="button" onClick={prepareReminder} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">Prepare SMS reminder</button>
            </div>
            {reminder && <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><h3 className="font-semibold">SMS reminder payload</h3><button onClick={() => setReminder(null)} className="text-sm text-slate-500">Close</button></div>{reminder.sendable ? <><p className="mt-2 text-sm text-slate-600">Recipient: {reminder.recipient}</p><p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-6">{reminder.message}</p><p className="mt-2 text-xs text-slate-500">Generated only—connect an authorized SMS gateway and obtain consent before sending.</p></> : <p className="mt-2 text-sm text-slate-600">{reminder.reason || 'No reminder is currently due.'}</p>}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(statusLabels).map(([key, label]) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[key]}`}>{label}</span><p className="mt-3 text-xl font-bold text-slate-900">{schedule.data?.filter((dose) => dose.status === key).length ?? '—'}</p></div>)}</div>
            {schedule.isLoading ? <div className="rounded-2xl bg-white p-6 text-slate-500">Loading schedule…</div> : !schedule.data?.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Vaccine schedule catalog is not available on this device. Sign in while online to download the reference schedule.</div> : <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Vaccine</th><th className="px-4 py-3">Dose</th><th className="px-4 py-3">Due date</th><th className="px-4 py-3">Window</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{schedule.data.map((dose) => <tr key={dose.schedule_id} className="hover:bg-slate-50/80"><td className="px-4 py-3 font-semibold text-slate-900">{dose.vaccine_name}<span className="ml-2 text-xs font-normal text-slate-400">{dose.vaccine_code}</span></td><td className="px-4 py-3">{dose.dose_label || `Dose ${dose.dose_number}`}</td><td className="px-4 py-3 whitespace-nowrap">{dose.due_date}</td><td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{dose.window_start} – {dose.window_end}</td><td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[dose.status] || statusStyles.upcoming}`}>{statusLabels[dose.status] || dose.status}</span></td><td className="px-4 py-3">{dose.status === 'completed' ? <span className="text-xs text-emerald-700">Given {String(dose.record?.administered_at || '').slice(0, 10)}</span> : <button type="button" onClick={() => { setActiveDose(dose); setDetails({ lot_number: '', administration_site: 'Barangay Health Center', notes: '' }); }} className="whitespace-nowrap rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50">Record dose</button>}</td></tr>)}</tbody></table></div></div>}
            <p className="text-xs leading-5 text-slate-500">Schedule dates are calculated from date of birth using the locally seeded reference schedule. Confirm the current DOH EPI circular and catch-up guidance before administering vaccines.</p>
            {activeDose && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={(event) => { event.preventDefault(); markDone.mutate(); }} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Immunization record</p><h3 className="mt-1 text-xl font-bold">{activeDose.vaccine_name} · dose {activeDose.dose_number}</h3></div><label className="block text-sm font-medium">Date administered<input required type="datetime-local" max={new Date().toISOString().slice(0, 16)} defaultValue={new Date().toISOString().slice(0, 16)} onChange={(e) => setDetails((current) => ({ ...current, administered_at: new Date(e.target.value).toISOString() }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Vaccine lot number<input value={details.lot_number} onChange={(e) => setDetails((current) => ({ ...current, lot_number: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Administration site<input value={details.administration_site} onChange={(e) => setDetails((current) => ({ ...current, administration_site: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>{markDone.isError && <p role="alert" className="text-sm text-rose-700">The dose could not be saved.</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setActiveDose(null)} className="rounded-xl border border-slate-300 px-4 py-2">Cancel</button><button disabled={markDone.isPending} className="rounded-xl bg-teal-800 px-4 py-2 font-semibold text-white">{markDone.isPending ? 'Saving…' : 'Save offline / online'}</button></div></form></div>}
        </section>
    );
}

function EmptyState({ text }) { return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{text}</div>; }
