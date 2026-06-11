import supabase from '../lib/supabase';

/**
 * Fetch or generate an AI script for a business
 */
export async function getScript(businessId, forceRegenerate = false) {
  const { data, error } = await supabase.functions.invoke('generate-script', {
    body: { business_id: businessId, force_regenerate: forceRegenerate }
  });

  if (error) throw new Error(error.message || 'Failed to generate script');
  if (data?.error) throw new Error(data.error);

  return data; // { cached: boolean, script: object }
}

/**
 * Rate a script (1-5 stars) — updates avg_rating with rolling average
 */
export async function rateScript(scriptId, rating) {
  // First get current rating stats
  const { data: script } = await supabase
    .from('ai_scripts')
    .select('avg_rating, rating_count')
    .eq('id', scriptId)
    .single();

  if (!script) throw new Error('Script not found');

  const currentCount = script.rating_count || 0;
  const currentAvg = parseFloat(script.avg_rating) || 0;
  const newCount = currentCount + 1;
  const newAvg = (currentAvg * currentCount + rating) / newCount;

  const { error } = await supabase
    .from('ai_scripts')
    .update({
      avg_rating: Math.round(newAvg * 100) / 100,
      rating_count: newCount,
    })
    .eq('id', scriptId);

  if (error) throw new Error(error.message);
  return { avg_rating: newAvg, rating_count: newCount };
}

/**
 * Get script generation history for a business
 */
export async function getScriptHistory(businessId) {
  const { data, error } = await supabase
    .from('ai_scripts')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
