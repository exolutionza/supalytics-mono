import { createClient } from '@supabase/supabase-js';

const supabaseUrl = '';
const supabaseKey = '';
export let supabase = createClient(supabaseUrl, supabaseKey);