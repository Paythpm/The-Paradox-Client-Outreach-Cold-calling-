import { useState, useEffect, useCallback } from 'react';
import supabase from '../lib/supabase';

export function useBusinessLock(businessId, callerId) {
  const [lockState, setLockState] = useState({ isLockedByOther: false, lockedByName: null });

  const acquireLock = useCallback(async () => {
    if (!businessId || !callerId) return;
    await supabase
      .from('businesses')
      .update({ locked_by: callerId, locked_at: new Date().toISOString() })
      .eq('id', businessId);
  }, [businessId, callerId]);

  const releaseLock = useCallback(async () => {
    if (!businessId || !callerId) return;
    await supabase
      .from('businesses')
      .update({ locked_by: null, locked_at: null })
      .eq('id', businessId)
      .eq('locked_by', callerId);
  }, [businessId, callerId]);

  useEffect(() => {
    if (!businessId || !callerId) return;

    let isMounted = true;

    const checkAndAcquire = async () => {
      const { data: biz } = await supabase
        .from('businesses')
        .select('locked_by, locked_at')
        .eq('id', businessId)
        .single();

      if (!isMounted) return;

      // No lock, or we own it
      if (!biz?.locked_by || biz.locked_by === callerId) {
        setLockState({ isLockedByOther: false, lockedByName: null });
        await acquireLock();
        return;
      }

      // Check if lock is stale (older than 10 minutes)
      const lockedAt = new Date(biz.locked_at);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (lockedAt < tenMinutesAgo) {
        setLockState({ isLockedByOther: false, lockedByName: null });
        await acquireLock();
        return;
      }

      // Genuinely locked by someone else — get their name
      const { data: lockerData } = await supabase
        .from('callers')
        .select('full_name')
        .eq('id', biz.locked_by)
        .single();

      if (!isMounted) return;
      setLockState({
        isLockedByOther: true,
        lockedByName: lockerData?.full_name || 'Another caller',
      });
    };

    checkAndAcquire();

    // Cleanup: release lock when component unmounts or business changes
    return () => {
      isMounted = false;
      releaseLock();
    };
  }, [businessId, callerId, acquireLock, releaseLock]);

  return { ...lockState, acquireLock, releaseLock };
}
