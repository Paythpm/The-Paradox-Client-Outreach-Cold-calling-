import { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

export function useDailyStats(callerId) {
  const [stats, setStats] = useState({ total: 0, interested: 0, meetings: 0 });

  useEffect(() => {
    if (!callerId) return;

    const fetchStats = async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('call_logs')
        .select('outcome')
        .eq('caller_id', callerId)
        .gte('started_at', startOfToday.toISOString());

      if (!data) return;

      const total = data.length;
      const interested = data.filter(l => l.outcome === 'answered_interested').length;
      const meetings = data.filter(l => l.outcome === 'meeting_booked').length;
      setStats({ total, interested, meetings });
    };

    fetchStats();

    // Real-time subscription for live updates
    const channel = supabase
      .channel(`daily-stats-${callerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, (payload) => {
        if (payload.new.caller_id === callerId) {
          setStats(prev => ({
            ...prev,
            total: prev.total + 1,
            interested: payload.new.outcome === 'answered_interested' ? prev.interested + 1 : prev.interested,
            meetings: payload.new.outcome === 'meeting_booked' ? prev.meetings + 1 : prev.meetings,
          }));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [callerId]);

  return stats;
}
