import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Mock client to prevent crashes if credentials are missing
const mockSupabase = {
  rpc: () => Promise.resolve({ data: null, error: new Error("Missing Supabase credentials") }),
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: new Error("Missing Supabase credentials") })
      })
    })
  })
};

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'))
  ? createClient(supabaseUrl, supabaseAnonKey)
  : mockSupabase;
