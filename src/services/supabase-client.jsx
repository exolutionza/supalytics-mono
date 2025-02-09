import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oedmyvlymptorkupspem.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lZG15dmx5bXB0b3JrdXBzcGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxNDc1MzcsImV4cCI6MjA1MzcyMzUzN30.7eWVc1AVeYfAP8bM9blpmk-9viQI7H6ZqddowynWfwA'

export let supabase = createClient(supabaseUrl, supabaseKey);