import { useState, useEffect, useRef } from 'react';
import supabase from '../lib/supabase';

/**
 * useAnalytics — fetches call data for analytics display.
 *
 * DESIGN: uses a ref-based approach to completely prevent re-fetch loops.
 * The fetch key is a string combining all inputs — only fetches when the key
 * actually changes (not on every render). This eliminates the useCallback/
 * useEffect dependency chain that was causing the admin crash.
 */
export function useAnalytics({ startISO, endISO, callerId } = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track the last fetch key to prevent duplicate fetches
  const lastFetchKey = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    // Skip if still pending auth
    if (!callerId || callerId === '__PENDING__') return;

    // Build a stable key from all inputs — only re-fetch if this actually changed
    const fetchKey = `${startISO}|${endISO}|${callerId || 'ALL'}`;
    if (fetchKey === lastFetchKey.current) return; // already fetched this exact combo
    lastFetchKey.current = fetchKey;

    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const startStr = startISO || new Date(Date.now() - 7 * 24 * 3600000).toISOString();
        const endStr   = endISO   || new Date().toISOString();

        // Build query — no caller filter for 'ALL'
        let logsQuery = supabase
          .from('call_logs')
          .select('*, businesses(business_name, category, country_code, city), callers(full_name)')
          .gte('started_at', startStr)
          .lte('started_at', endStr);

        if (callerId && callerId !== 'ALL') {
          logsQuery = logsQuery.eq('caller_id', callerId);
        }

        const [logsResult, meetingsResult] = await Promise.all([
          logsQuery,
          supabase.from('meetings').select('*').gte('created_at', startStr).lte('created_at', endStr),
        ]);

        if (cancelled) return;
        if (logsResult.error) throw logsResult.error;

        const allLogs     = logsResult.data    || [];
        const allMeetings = meetingsResult.data || [];
        const connected   = allLogs.filter(l => l.outcome?.startsWith('answered'));
        const interested  = allLogs.filter(l => l.outcome === 'answered_interested');

        // Overview
        const overview = {
          total_calls:     allLogs.length,
          total_connected: connected.length,
          total_interested: interested.length,
          total_meetings:  allMeetings.length,
          answer_rate:     allLogs.length     ? Math.round(connected.length  / allLogs.length     * 100) : 0,
          interest_rate:   connected.length   ? Math.round(interested.length / connected.length   * 100) : 0,
          meeting_rate:    interested.length  ? Math.round(allMeetings.length / interested.length * 100) : 0,
          avg_duration:    connected.length   ? Math.round(
            connected.filter(l => l.duration_seconds > 0).reduce((s, l) => s + l.duration_seconds, 0) /
            Math.max(connected.filter(l => l.duration_seconds > 0).length, 1)
          ) : 0,
        };

        // Daily trend
        const dailyMap = {};
        allLogs.forEach(l => {
          const day = l.started_at?.slice(0, 10);
          if (!day) return;
          if (!dailyMap[day]) dailyMap[day] = { date: day, total_calls: 0, interested: 0, meetings: 0 };
          dailyMap[day].total_calls++;
          if (l.outcome === 'answered_interested') dailyMap[day].interested++;
        });
        allMeetings.forEach(m => {
          const day = m.created_at?.slice(0, 10);
          if (day && dailyMap[day]) dailyMap[day].meetings++;
        });
        const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        // Per-caller
        const callerMap = {};
        allLogs.forEach(l => {
          const id = l.caller_id;
          if (!callerMap[id]) callerMap[id] = { id, name: l.callers?.full_name || 'Unknown', total: 0, connected: 0, interested: 0, durations: [] };
          callerMap[id].total++;
          if (l.outcome?.startsWith('answered')) callerMap[id].connected++;
          if (l.outcome === 'answered_interested') callerMap[id].interested++;
          if (l.duration_seconds > 0) callerMap[id].durations.push(l.duration_seconds);
        });
        const perCaller = Object.values(callerMap).map(c => ({
          ...c,
          meetings: allMeetings.filter(m => m.booked_by === c.id).length,
          avg_duration: c.durations.length ? Math.round(c.durations.reduce((a, b) => a + b, 0) / c.durations.length) : 0,
          conversion_rate: c.connected ? Math.round(c.interested / c.connected * 100) : 0,
        })).sort((a, b) => b.interested - a.interested);

        // Outcome breakdown
        const outcomeMap = {};
        allLogs.forEach(l => { if (l.outcome) outcomeMap[l.outcome] = (outcomeMap[l.outcome] || 0) + 1; });
        const outcomeBreakdown = Object.entries(outcomeMap).map(([outcome, count]) => ({
          outcome, count, percentage: allLogs.length ? Math.round(count / allLogs.length * 100) : 0,
        }));

        // Top categories
        const catMap = {};
        allLogs.forEach(l => {
          const cat = l.businesses?.category || 'Unknown';
          if (!catMap[cat]) catMap[cat] = { category: cat, calls: 0, interested: 0 };
          catMap[cat].calls++;
          if (l.outcome === 'answered_interested') catMap[cat].interested++;
        });
        const topCategories = Object.values(catMap)
          .map(c => ({ ...c, conversion_rate: c.calls ? Math.round(c.interested / c.calls * 100) : 0 }))
          .sort((a, b) => b.calls - a.calls).slice(0, 10);

        // Hourly pattern
        const hourMap = {};
        for (let h = 0; h < 24; h++) hourMap[h] = { hour: h, calls: 0, interested: 0 };
        allLogs.forEach(l => {
          if (!l.started_at) return;
          const h = new Date(l.started_at).getHours();
          hourMap[h].calls++;
          if (l.outcome === 'answered_interested') hourMap[h].interested++;
        });
        const hourlyPattern = Object.values(hourMap).map(h => ({
          ...h, interest_rate: h.calls ? Math.round(h.interested / h.calls * 100) : 0,
        }));

        if (!cancelled && isMounted.current) {
          setData({ overview, dailyTrend, perCaller, outcomeBreakdown, topCategories, hourlyPattern, allLogs, allMeetings });
        }
      } catch (err) {
        if (!cancelled && isMounted.current) setError(err.message);
      } finally {
        if (!cancelled && isMounted.current) setIsLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [startISO, endISO, callerId]); // simple deps — fetchKey guard prevents duplicate calls

  return { data, isLoading, error };
}
