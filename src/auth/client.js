let clientPromise;

export function getClient() {
  if (!clientPromise) clientPromise = initialize().catch(error => {
    clientPromise = undefined;
    throw error;
  });
  return clientPromise;
}

async function initialize() {
  const response = await fetch('/auth-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Sign-in is not configured yet. Please contact the site owner.');
  const { supabaseUrl, supabasePublishableKey } = await response.json();
  if (!supabaseUrl || !supabasePublishableKey) throw new Error('Sign-in is not configured yet. Please contact the site owner.');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}
