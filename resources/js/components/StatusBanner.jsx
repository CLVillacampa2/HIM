import { useOfflineSync } from '../hooks/useOfflineSync';

export function StatusBanner() {
    const { isOnline, pending, attention, isSyncing, lastError, syncNow } = useOfflineSync();
    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${isOnline ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-teal-500' : 'bg-amber-500'}`} />
                <span className="font-semibold">{isOnline ? 'Online' : 'Offline'}</span>
                <span className="text-slate-600">{pending} pending {pending === 1 ? 'record' : 'records'}</span>
                {attention > 0 && <span className="font-semibold text-rose-700">{attention} need review</span>}
                {lastError && <span className="text-rose-700">{lastError}</span>}
            </div>
            <button
                type="button"
                onClick={syncNow}
                disabled={!isOnline || isSyncing || pending === 0}
                className="rounded-xl bg-teal-800 px-4 py-2 font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
                {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
        </div>
    );
}
