import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://djdqojnjcolkhiazvfve.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZHFvam5qY29sa2hpYXp2ZnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg4NzA5NTUsImV4cCI6MjA1NDQ0Njk1NX0.FDeiaPIrDWx0kblhS6LWmkt3T51T9a72ihGX1eY9bPY'
export let supabase = createClient(supabaseUrl, supabaseKey);