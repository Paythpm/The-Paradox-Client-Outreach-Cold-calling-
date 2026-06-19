import { useState, useEffect, useCallback } from 'react';
import supabase from '../lib/supabase';

export function useAnalytics({ startISO, endISO, countryCode, callerId } = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Normalize callerId to a stable string — undefined and null are treated as 'ALL'
  // This prevents useCallback from seeing new references on every render
  const stableCallerId = callerId ?? 'ALL';

  const fetch = useCallback(async () => {
    // '__PENDING__' is a sentinel from AnalyticsPage — auth not ready yet, skip fetch
    if (stableCallerId === '__PENDING__') return;

    setIsLoading(true);
    setError(null);
    try {
      // Accept pre-computed ISO strings to avoid Date object reference instability
      const startStr = startISO || new Date(Date.now() - 30 * 24 * 3600000).toISOString();
      const endStr = endISO || new Date().toISOString();
      let logsQuery = supabase.from('call_logs').select('*, businesses(business_name, category, country_code, city), callers(full_name)').gte('started_at', startStr).lte('started_at', endStr);
      // Only filter by caller if a specific caller is selected (not 'ALL')
      if (stableCallerId && stableCallerId !== 'ALL' && stableCallerId !== '__PENDING__') {
        logsQuery = logsQuery.eq('caller_id', stableCallerId);
      }

      const { data: logs, error: logsErr } = await logsQuery;
      if (logsErr) throw logsErr;

      const allLogs = logs || [];
      const connected = allLogs.filter(l => l.outcome && l.outcome.startsWith('answered'));
      const interested = allLogs.filter(l => l.outcome === 'answered_interested');

      let meetingsQuery = supabase.from('meetings').select('*').gte('created_at', startStr).lte('created_at', endStr);
      const { data: meetings } = await meetingsQuery;
      const allMeetings = meetings || [];

      // Overview stats
      const overview = {
        total_calls: allLogs.length,
        total_connected: connected.length,
        total_interested: interested.length,
        total_meetings: allMeetings.length,
        answer_rate: allLogs.length ? Math.round(connected.length / allLogs.length * 100) : 0,
        interest_rate: connected.length ? Math.round(interested.length / connected.length * 100) : 0,
        meeting_rate: interested.length ? Math.round(allMeetings.length / interested.length * 100) : 0,
        avg_duration: connected.length ? Math.round(connected.filter(l => l.duration_seconds > 0).reduce((s, l) => s + l.duration_seconds, 0) / Math.max(connected.filter(l => l.duration_seconds > 0).length, 1)) : 0,
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

      // Per-caller stats
      const callerMap = {};
      allLogs.forEach(l => {
        const id = l.caller_id;
        const name = l.callers?.full_name || 'Unknown';
        if (!callerMap[id]) callerMap[id] = { id, name, total: 0, connected: 0, interested: 0, durations: [] };
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
      allLogs.forEach(l => {
        if (l.outcome) outcomeMap[l.outcome] = (outcomeMap[l.outcome] || 0) + 1;
      });
      const outcomeBreakdown = Object.entries(outcomeMap).map(([outcome, count]) => ({
        outcome, count,
        percentage: allLogs.length ? Math.round(count / allLogs.length * 100) : 0,
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

      // Country breakdown
      const countryMap = {};
      allLogs.forEach(l => {
        const cc = l.businesses?.country_code || 'Unknown';
        if (!countryMap[cc]) countryMap[cc] = { country: cc, calls: 0, interested: 0 };
        countryMap[cc].calls++;
        if (l.outcome === 'answered_interested') countryMap[cc].interested++;
      });
      const countryBreakdown = Object.values(countryMap);

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
        ...h,
        interest_rate: h.calls ? Math.round(h.interested / h.calls * 100) : 0,
      }));

      setData({ overview, dailyTrend, perCaller, outcomeBreakdown, topCategories, countryBreakdown, hourlyPattern, allLogs, allMeetings });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [startISO, endISO, countryCode, stableCallerId]); // all stable primitives — no re-render loop

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
