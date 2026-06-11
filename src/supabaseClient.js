import { createClient } from '@supabase/supabase-js';

// Helper to clean and sanitize the Supabase URL
export const sanitizeSupabaseUrl = (url) => {
  if (!url) return '';
  let cleaned = url.trim();
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');
  // Remove /rest/v1 if user copied the full API url
  cleaned = cleaned.replace(/\/rest\/v1$/, '');
  // Clean trailing slashes again
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
};

// Get credentials from localStorage or .env file
export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem('calendar_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: localStorage.getItem('calendar_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    bucketName: localStorage.getItem('calendar_supabase_bucket') || import.meta.env.VITE_SUPABASE_BUCKET || 'calendar-images',
  };
};

// Save credentials to localStorage
export const saveSupabaseConfig = (url, anonKey, bucketName = 'calendar-images') => {
  localStorage.setItem('calendar_supabase_url', sanitizeSupabaseUrl(url));
  localStorage.setItem('calendar_supabase_anon_key', anonKey.trim());
  localStorage.setItem('calendar_supabase_bucket', bucketName.trim());
};

// Create a Supabase client instance dynamically
export const getSupabaseClient = () => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }
  try {
    return createClient(sanitizeSupabaseUrl(url), anonKey);
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
};

// Test Supabase connection
export const testSupabaseConnection = async (url, anonKey) => {
  if (!url || !anonKey) {
    throw new Error('Supabase URL and Anon Key are required.');
  }
  
  const cleanUrl = sanitizeSupabaseUrl(url);
  
  try {
    const tempClient = createClient(cleanUrl, anonKey);
    // Try to fetch 1 row from import_sessions just to check connectivity
    const { data, error } = await tempClient
      .from('import_sessions')
      .select('id')
      .limit(1);
      
    if (error) {
      // If the table doesn't exist, connection succeeded but table is missing
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        return {
          success: true,
          warning: 'Connected to Supabase, but "import_sessions" table was not found. Please run the SQL schema.'
        };
      }
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to Supabase.'
    };
  }
};
