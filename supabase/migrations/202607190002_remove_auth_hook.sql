-- Free-plan approval flow: authorization is enforced by RLS and Edge Functions.
drop policy if exists "auth hook reads profiles" on public.profiles;
revoke select on public.profiles from supabase_auth_admin;
drop function if exists public.custom_access_token_hook(jsonb);
