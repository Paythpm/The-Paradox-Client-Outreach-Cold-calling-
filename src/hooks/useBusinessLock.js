import { useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';

/**
 * useBusinessLock — coordinates which agent "owns" a lead so two agents can't
 * call the same business at once.
 *
 * Acquisition is ATOMIC via the try_lock_business RPC (single conditional UPDATE
 * in Postgres) — no check-then-act race. While a lead is selected we send a
 * heartbeat every 60s so our lock stays fresh during a long call, and re-check
 * if we're currently waiting on someone else's lock. On unmount / lead change we
 * release the lock (only if we own it).
 *
 * A lock auto-expires after 10 minutes server-side, so a crashed tab never
 * permanently blocks a lead.
 */
export function useBusinessLock(businessId, callerId) {
  const [lockState, setLockState] = useState({
    isLockedByOther: false,
    lockedByName: null,
    acquired: false,
  });
  const intervalRef = useRef(null);

  const acquireLock = useCallback(async () => {
    if (!businessId || !callerId) return false;
    const { data, error } = await supabase.rpc('try_lock_business', {
      p_business_id: businessId,
      p_caller_id: callerId,
    });
    if (error || !data || !data[0]) return false;
    const row = data[0];
    if (row.acquired) {
      setLockState({ isLockedByOther: false, lockedByName: null, acquired: true });
      return true;
    }
    setLockState({
      isLockedByOther: true,
      lockedByName: row.locked_by_name || 'Another caller',
      acquired: false,
    });
    return false;
  }, [businessId, callerId]);

  const releaseLock = useCallback(async () => {
    if (!businessId || !callerId) return;
    await supabase.rpc('release_business_lock', {
      p_business_id: businessId,
      p_caller_id: callerId,
    });
  }, [businessId, callerId]);

  useEffect(() => {
    if (!businessId || !callerId) {
      setLockState({ isLockedByOther: false, lockedByName: null, acquired: false });
      return;
    }

    let cancelled = false;
    acquireLock();

    // Heartbeat: keep our lock fresh; also retries if we were blocked.
    intervalRef.current = setInterval(() => { if (!cancelled) acquireLock(); }, 60000);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      releaseLock();
    };
  }, [businessId, callerId, acquireLock, releaseLock]);

  return { ...lockState, acquireLock, releaseLock };
}
