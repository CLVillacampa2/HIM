import { useCallback, useEffect, useRef, useState } from 'react';
import { pendingSyncCount, syncAttentionCount } from '../db';
import { syncPendingQueue } from '../services/syncService';
import { useNetworkStatus } from './useNetworkStatus';

export function useOfflineSync() {
    const isOnline = useNetworkStatus();
    const [pending, setPending] = useState(0);
    const [attention, setAttention] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastError, setLastError] = useState('');
    const syncLock = useRef(false);

    const refreshCount = useCallback(async () => {
        const [pendingCount, attentionCount] = await Promise.all([pendingSyncCount(), syncAttentionCount()]);
        setPending(pendingCount);
        setAttention(attentionCount);
    }, []);

    const syncNow = useCallback(async () => {
        if (!isOnline || syncLock.current) return;
        syncLock.current = true;
        setIsSyncing(true);
        setLastError('');
        try {
            await syncPendingQueue();
            await refreshCount();
        } catch (error) {
            setLastError(error.response?.data?.message || 'Sync failed. Pending records remain safely on this device.');
        } finally {
            syncLock.current = false;
            setIsSyncing(false);
        }
    }, [isOnline, refreshCount]);

    useEffect(() => {
        refreshCount();
        const handleQueueChange = () => {
            refreshCount();
            if (isOnline) syncNow();
        };
        const interval = window.setInterval(refreshCount, 5000);
        window.addEventListener('ehr-queue-updated', handleQueueChange);
        navigator.serviceWorker?.addEventListener('message', handleQueueChange);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('ehr-queue-updated', handleQueueChange);
            navigator.serviceWorker?.removeEventListener('message', handleQueueChange);
        };
    }, [isOnline, refreshCount, syncNow]);

    useEffect(() => {
        if (isOnline) syncNow();
    }, [isOnline, syncNow]);

    return { isOnline, pending, attention, isSyncing, lastError, syncNow, refreshCount };
}
