import { useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';
import { getCallingScoreCached } from '../utils/callingHours';

// Smart composite sort: calling time × health × call status priority
function sortBusinessesSmart(businesses) {
  const STATUS_PRIORITY = {
    callback_requested: 1.0,
    not_called:         0.7,
    no_answer:          0.4,
    interested:         0.2,
  };

  return [...businesses].sort((a, b) => {
    const aCallScore = getCallingScoreCached(a.city || '', a.country_code || '').score / 100;
    const bCallScore = getCallingScoreCached(b.city || '', b.country_code || '').score / 100;

    // Businesses that are illegal to call sink to the bottom
    if (aCallScore === 0 && bCallScore > 0) return 1;
    if (bCallScore === 0 && aCallScore > 0) return -1;

    const aHealth   = (100 - (a.health_score || 50)) / 100;
    const bHealth   = (100 - (b.health_score || 50)) / 100;
    const aStatus   = STATUS_PRIORITY[a.call_status] ?? 0.1;
    const bStatus   = STATUS_PRIORITY[b.call_status] ?? 0.1;

    const aPriority = aCallScore * 0.40 + aHealth * 0.35 + aStatus * 0.25;
    const bPriority = bCallScore * 0.40 + bHealth * 0.35 + bStatus * 0.25;

    return bPriority - aPriority;
  });
}

export function useRealtimeBusinesses({ countryCode = 'AU', filters = {} }) {
  const [businesses, setBusinesses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);

  const fetchBusinesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('businesses')
        .select('*')
        .eq('country_code', countryCode)
        .eq('do_not_call', false);

      if (filters.callStatus) query = query.eq('call_status', filters.callStatus);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.city) query = query.ilike('city', `%${filters.city}%`);
      if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
      if (filters.hasPhone) query = query.not('phone', 'is', null);
      if (filters.searchQuery) query = query.ilike('business_name', `%${filters.searchQuery}%`);

      // Sort
      const sortField = filters.sortBy || 'health_score';
      const pageFrom = filters.page ? filters.page * 50 : 0;

      if (sortField === 'smart') {
        query = query.range(pageFrom, pageFrom + 199);
      } else {
        const sortAsc = filters.sortAscending || false;
        query = query.order(sortField, { ascending: sortAsc, nullsFirst: false });
        query = query.range(pageFrom, pageFrom + 49);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const raw = data || [];
      setBusinesses(sortField === 'smart' ? sortBusinessesSmart(raw) : raw);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [countryCode, JSON.stringify(filters)]);

  // Subscribe to real-time changes
  useEffect(() => {
    fetchBusinesses();

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    channelRef.current = supabase
      .channel(`businesses-${countryCode}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'businesses' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setBusinesses(prev =>
              prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b)
            );
          }
          if (payload.eventType === 'INSERT' && payload.new.country_code === countryCode) {
            setBusinesses(prev => [payload.new, ...prev]);
          }
          if (payload.eventType === 'DELETE') {
            setBusinesses(prev => prev.filter(b => b.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchBusinesses, countryCode]);

  return { businesses, isLoading, error, refetch: fetchBusinesses };
}
