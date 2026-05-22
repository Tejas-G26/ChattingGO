import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eofgaujpksoiytgulitx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZmdhdWpwa3NvaXl0Z3VsaXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MjIwMDYsImV4cCI6MjA3OTE5ODAwNn0.6TtVvbNVFdJHz9R7jLZFLoQOXPDdAzG3x0MWx6uPqz8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
