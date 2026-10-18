import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import { LoginForm } from './components/LoginForm';
import { PatientForm } from './components/PatientForm';
import { ImmunizationMatrix } from './components/ImmunizationMatrix';
import { EncounterForm } from './components/EncounterForm';
import { StatusBanner } from './components/StatusBanner';
import { archivePatient, currentUser, hasSession, listPatients, refreshReferenceData, signOut } from './services/ehrService';

registerSW({ immediate: true });

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        mutations: { retry: 0 },
    },
});

function EHRApp() {
    const [authState, setAuthState] = useState('loading');
    const [user, setUser] = useState(null);

    useEffect(() => {
        let alive = true;
        Promise.all([hasSession(), currentUser()]).then(([hasToken, savedUser]) => {
            if (alive) { setUser(savedUser); setAuthState(hasToken ? 'ready' : 'signed-out'); }
        }).catch(() => alive && setAuthState('signed-out'));
        return () => { alive = false; };
    }, []);

    if (authState === 'loading') return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">Opening secure local records…</div>;
    if (authState === 'signed-out') return <LoginForm onSignedIn={(signedInUser) => { setUser(signedInUser); setAuthState('ready'); }} />;

    return <Workspace user={user} onSignOut={async () => { await signOut(); queryClient.clear(); setUser(null); setAuthState('signed-out'); }} />;
}

function Workspace({ user, onSignOut }) {
    const client = useQueryClient();
    const [tab, setTab] = useState('patients');
    const [search, setSearch] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [editingPatient, setEditingPatient] = useState(undefined);
    const [syncMessage, setSyncMessage] = useState('');
    const patients = useQuery({ queryKey: ['patients', search], queryFn: () => listPatients(search) });

    useEffect(() => {
        if (navigator.onLine) refreshReferenceData().then(() => {
            client.invalidateQueries({ queryKey: ['patients'] });
            client.invalidateQueries({ queryKey: ['households'] });
        }).catch((error) => console.info('Reference refresh deferred:', error.message));
    }, [client]);

    useEffect(() => {
        if (!selectedPatient && patients.data?.length) setSelectedPatient(patients.data[0]);
        else if (selectedPatient && patients.data?.length) {
            const fresh = patients.data.find((patient) => patient.patient_uuid === selectedPatient.patient_uuid);
            if (fresh) setSelectedPatient(fresh);
        }
    }, [patients.data, selectedPatient]);

    const selectedName = useMemo(() => selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'No patient selected', [selectedPatient]);

    async function savedPatient(patient) {
        setSelectedPatient(patient);
        setEditingPatient(undefined);
        setSyncMessage('Patient saved to this device. Sync will resume automatically when online.');
        await client.invalidateQueries({ queryKey: ['patients'] });
        window.setTimeout(() => setSyncMessage(''), 5000);
    }

    async function archiveSelectedPatient() {
        if (!selectedPatient || !window.confirm(`Archive ${selectedPatient.first_name} ${selectedPatient.last_name}? The record will be soft-deleted on the server after sync.`)) return;
        await archivePatient(selectedPatient);
        setSelectedPatient(null);
        setEditingPatient(undefined);
        await client.invalidateQueries({ queryKey: ['patients'] });
        setSyncMessage('Patient archived locally. The archive will sync when online.');
        window.setTimeout(() => setSyncMessage(''), 5000);
    }

    const navItems = [
        { id: 'patients', label: 'Patient index', hint: 'Registration & households' },
        { id: 'immunization', label: 'Immunization', hint: 'Childhood dose tracker' },
        { id: 'encounter', label: 'Clinical encounter', hint: 'Consultation & ICD-10' },
    ];

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-800 text-xl font-bold text-white">+</div><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-800">Barangay Health Center</p><h1 className="text-lg font-bold">EHR & Immunization</h1></div></div>
                    <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user?.name || 'Health worker'}</p><p className="text-xs text-slate-500">{user?.email}</p></div><button onClick={onSignOut} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Sign out</button></div>
                </div>
            </header>
            <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
                <StatusBanner />
                {syncMessage && <div role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{syncMessage}</div>}
                <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
                    <aside className="space-y-4">
                        <nav className="grid gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm lg:block">{navItems.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`w-full rounded-2xl px-4 py-3 text-left transition ${tab === item.id ? 'bg-teal-900 text-white shadow' : 'text-slate-700 hover:bg-slate-100'}`}><span className="block text-sm font-bold">{item.label}</span><span className={`mt-0.5 block text-xs ${tab === item.id ? 'text-teal-100' : 'text-slate-500'}`}>{item.hint}</span></button>)}</nav>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">Patient queue</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{patients.data?.length ?? 0}</span></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient" className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700" /><div className="mt-3 max-h-[50vh] space-y-1 overflow-auto">{(patients.data || []).map((patient) => <button key={patient.patient_uuid} onClick={() => { setSelectedPatient(patient); setEditingPatient(undefined); }} className={`w-full rounded-xl px-3 py-2.5 text-left ${selectedPatient?.patient_uuid === patient.patient_uuid ? 'bg-teal-50 ring-1 ring-teal-200' : 'hover:bg-slate-50'}`}><span className="block truncate text-sm font-semibold">{patient.first_name} {patient.last_name}</span><span className="block truncate text-xs text-slate-500">{patient.patient_number} · {String(patient.date_of_birth).slice(0, 10)}</span></button>)}{patients.isLoading && <p className="p-3 text-sm text-slate-500">Loading local index…</p>}{!patients.isLoading && !patients.data?.length && <p className="p-3 text-sm text-slate-500">No patients saved on this device.</p>}</div><button onClick={() => { setTab('patients'); setEditingPatient(null); }} className="mt-3 w-full rounded-xl bg-teal-800 px-3 py-2.5 text-sm font-bold text-white hover:bg-teal-900">+ Register patient</button></div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Privacy reminder:</strong> lock the tablet when unattended. Offline records are stored in browser IndexedDB and are not encrypted by this app.</div>
                    </aside>
                    <section className="min-w-0 space-y-4">
                        {tab === 'patients' && <>
                            {editingPatient !== undefined ? <PatientForm initialPatient={editingPatient || null} onSaved={savedPatient} onCancel={() => setEditingPatient(undefined)} /> : <>
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Patient Master Index</p><h2 className="mt-1 text-xl font-bold">{selectedName}</h2><p className="mt-1 text-sm text-slate-500">Use the patient queue to select a household member.</p></div>{selectedPatient && <div className="flex gap-2"><button onClick={() => setEditingPatient(selectedPatient)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Edit patient</button><button onClick={archiveSelectedPatient} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Archive</button></div>}</div>
                                {selectedPatient ? <div className="grid gap-4 xl:grid-cols-2"><InfoCard title="Patient details" rows={[["Patient ID", selectedPatient.patient_number], ["Birthdate", String(selectedPatient.date_of_birth).slice(0, 10)], ["Sex at birth", selectedPatient.sex_at_birth], ["Contact", selectedPatient.contact_number || 'Not recorded'], ["PhilHealth ID", selectedPatient.philhealth_id || 'Not recorded'], ["Household", selectedPatient.household?.household_code || selectedPatient.household_code || 'Not linked']]} /><InfoCard title="Family & guardian" rows={[["Household head", selectedPatient.is_household_head ? 'Yes' : 'No'], ["Guardian", selectedPatient.guardian_name || 'Not recorded'], ["Relationship", selectedPatient.guardian_relationship || 'Not recorded'], ["Guardian phone", selectedPatient.guardian_contact_number || 'Not recorded'], ["Sync status", selectedPatient.sync_status || 'On device']]} /></div> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Register a patient or select one from the queue.</div>}
                            </>}
                        </>}
                        {tab === 'immunization' && <ImmunizationMatrix patient={selectedPatient} />}
                        {tab === 'encounter' && <EncounterForm patient={selectedPatient} />}
                    </section>
                </div>
                <footer className="pb-4 text-center text-xs leading-5 text-slate-500">For authorized barangay health workers. Clinical schedules and coding catalogs require review against current DOH guidance before operational use.</footer>
            </main>
        </div>
    );
}

function InfoCard({ title, rows }) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold">{title}</h3><dl className="mt-4 divide-y divide-slate-100">{rows.map(([key, value]) => <div key={key} className="flex justify-between gap-4 py-2.5 text-sm"><dt className="text-slate-500">{key}</dt><dd className="text-right font-medium text-slate-800">{value}</dd></div>)}</dl></section>;
}

export default function App() {
    return <QueryClientProvider client={queryClient}><EHRApp /></QueryClientProvider>;
}

const rootElement = document.getElementById('app');
if (rootElement) {
    globalThis.__ehrRoot ??= createRoot(rootElement);
    globalThis.__ehrRoot.render(<App />);
}
