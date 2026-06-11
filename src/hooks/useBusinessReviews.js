/**
 * useBusinessReviews — fetches real review quotes for a business from business_reviews table
 * Returns quotes grouped by pain_category, ready for ClinicDetail's painQuotes prop
 */
import { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

export function useBusinessReviews(businessId) {
  const [painQuotes, setPainQuotes] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!businessId) { setPainQuotes({}); return; }

    let cancelled = false;
    setIsLoading(true);

    supabase
      .from('business_reviews')
      .select('pain_category, review_text, rating, review_date')
      .eq('business_id', businessId)
      .not('review_text', 'is', null)
      .order('rating', { ascending: true }) // show lowest rated first
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;

        // Group by pain_category
        const grouped = {};
        for (const row of data) {
          const key = row.pain_category || '__uncategorized__';
          if (!grouped[key]) grouped[key] = [];
          if (grouped[key].length < 5) {
            grouped[key].push({
              text:   row.review_text,
              rating: row.rating ? row.rating + '★' : '★',
            });
          }
        }

        // Remove uncategorized from display
        delete grouped['__uncategorized__'];

        setPainQuotes(grouped);
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [businessId]);

  return { painQuotes, isLoading };
}
