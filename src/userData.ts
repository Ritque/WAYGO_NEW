import { isSupabaseConfigured, supabase } from './supabaseClient';

export async function getUserData<T>(userId: string, key: string): Promise<T | null> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const { data, error } = await supabase
    .from('user_data')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as T | undefined) ?? null;
}

export async function setUserData(userId: string, key: string, value: unknown): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const { error } = await supabase.from('user_data').upsert(
    { user_id: userId, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' },
  );
  if (error) throw error;
}

export async function deleteUserData(userId: string, key: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const { error } = await supabase.from('user_data').delete().eq('user_id', userId).eq('key', key);
  if (error) throw error;
}
