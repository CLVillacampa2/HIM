import { useState } from 'react';
import { signIn } from '../services/ehrService';

export function LoginForm({ onSignedIn }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const user = await signIn({ email, password, deviceName: `BHW ${navigator.platform || 'tablet'}` });
            onSignedIn(user);
        } catch (reason) {
            setError(reason.response?.data?.message || 'Sign-in needs an internet connection. Previously authenticated devices can continue offline.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10">
            <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
                <div className="mb-7 flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-800 text-xl text-white">+</div>
                    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-800">Barangay Health Center</p><h1 className="text-2xl font-bold text-slate-900">Health records</h1></div>
                </div>
                <p className="mb-6 text-sm leading-6 text-slate-600">Sign in with your health-center account. Records saved on this registered device can be entered offline and synchronized later.</p>
                {error && <div role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
                <label className="mb-4 block text-sm font-semibold text-slate-700">Work email
                    <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
                </label>
                <label className="mb-6 block text-sm font-semibold text-slate-700">Password
                    <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
                </label>
                <button disabled={busy} className="w-full rounded-xl bg-teal-800 px-4 py-3 font-semibold text-white hover:bg-teal-900 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in securely'}</button>
                <p className="mt-5 text-xs leading-5 text-slate-500">Use only on an authorized, access-controlled health-center device. Offline health data remains stored on this device.</p>
            </form>
        </main>
    );
}
