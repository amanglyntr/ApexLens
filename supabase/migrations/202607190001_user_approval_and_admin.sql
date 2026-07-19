-- Admin-approved access enforced by RLS and Edge Function authorization.
alter table public.profiles
  add column if not exists role text not null default 'USER'
    check (role in ('USER', 'ADMIN')),
  add column if not exists approval_status text not null default 'PENDING'
    check (approval_status in ('PENDING', 'APPROVED', 'REJECTED')),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create index if not exists profiles_approval_status_idx
  on public.profiles(approval_status, created_at desc);

drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles
for each row execute procedure public.set_updated_at();

create or replace function public.is_approved_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.approval_status = 'APPROVED'
  );
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.approval_status = 'APPROVED'
      and p.role = 'ADMIN'
  );
$$;

revoke all on function public.is_approved_user(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_approved_user(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- Replace application policies so approval is enforced even if a client bypasses the UI.
drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "admins read profiles" on public.profiles for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "projects owner access" on public.projects;
create policy "approved owners manage projects" on public.projects for all to authenticated
  using ((select public.is_approved_user()) and owner_id = (select auth.uid()))
  with check ((select public.is_approved_user()) and owner_id = (select auth.uid()));

drop policy if exists "uploads owner read" on public.project_uploads;
drop policy if exists "uploads owner insert" on public.project_uploads;
create policy "approved owners read uploads" on public.project_uploads for select to authenticated
  using ((select public.is_approved_user()) and owner_id = (select auth.uid()));
create policy "approved owners insert uploads" on public.project_uploads for insert to authenticated
  with check ((select public.is_approved_user()) and owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists "jobs owner read" on public.analysis_jobs;
create policy "approved owners read jobs" on public.analysis_jobs for select to authenticated
  using ((select public.is_approved_user()) and owner_id = (select auth.uid()));

drop policy if exists "files through owned job" on public.repository_files;
create policy "approved owners read files" on public.repository_files for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "units through owned job" on public.review_units;
create policy "approved owners read units" on public.review_units for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "unit files through owned unit" on public.review_unit_files;
create policy "approved owners read unit files" on public.review_unit_files for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.review_units u join public.analysis_jobs j on j.id = u.analysis_job_id
    where u.id = review_unit_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "findings through owned job" on public.findings;
create policy "approved owners read findings" on public.findings for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "locations through owned finding" on public.finding_locations;
create policy "approved owners read finding locations" on public.finding_locations for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.findings f join public.analysis_jobs j on j.id = f.analysis_job_id
    where f.id = finding_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "observations through owned job" on public.positive_observations;
create policy "approved owners read observations" on public.positive_observations for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "reports through owned job" on public.reports;
create policy "approved owners read reports" on public.reports for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

drop policy if exists "audit owner read" on public.audit_events;
create policy "approved owners read audit" on public.audit_events for select to authenticated
  using ((select public.is_approved_user()) and owner_id = (select auth.uid()));

drop policy if exists "users upload to own prefix" on storage.objects;
drop policy if exists "users read own uploads" on storage.objects;
drop policy if exists "users read own reports" on storage.objects;
create policy "approved users upload to own prefix" on storage.objects for insert to authenticated
  with check ((select public.is_approved_user()) and bucket_id = 'project-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "approved users read own uploads" on storage.objects for select to authenticated
  using ((select public.is_approved_user()) and bucket_id = 'project-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "approved users read own reports" on storage.objects for select to authenticated
  using ((select public.is_approved_user()) and bucket_id = 'report-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Bootstrap exactly one administrator in the SQL editor:
-- update public.profiles
-- set role = 'ADMIN', approval_status = 'APPROVED', approved_by = id, approved_at = now()
-- where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
