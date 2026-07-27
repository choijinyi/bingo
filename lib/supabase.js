import { createClient } from "@supabase/supabase-js";

// anon key는 공개용 키이며 실제 접근 제어는 Supabase RLS 정책이 담당한다.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvfzprnxvexzilaxyuld.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Znpwcm54dmV4emlsYXh5dWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0Mjk3NDEsImV4cCI6MjA5NzAwNTc0MX0.1IOTl2v7Gr0gBY2JOyRNAmbX6XhjJcaTlE27WlECvkQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
