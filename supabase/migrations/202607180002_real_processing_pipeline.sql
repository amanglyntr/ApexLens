-- Persistent state and atomic claims for the real, restartable processing pipeline.
alter table public.analysis_jobs
  add column if not exists stage_cursor integer not null default 0,
  add column if not exists stage_metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists cancel_requested_at timestamptz;

alter table public.review_units
  add column if not exists limitations_json jsonb not null default '[]'::jsonb,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

alter table public.reports
  add column if not exists architecture_summary text,
  add column if not exists top_recommendations_json jsonb not null default '[]'::jsonb,
  add column if not exists limitations_json jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists repository_files_job_path_uidx
  on public.repository_files(analysis_job_id, relative_path_masked);
create index if not exists uploads_expiry_idx
  on public.project_uploads(expires_at, status);
create index if not exists jobs_recovery_idx
  on public.analysis_jobs(status, last_heartbeat_at)
  where status not in ('COMPLETED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED');
create index if not exists review_units_lease_idx
  on public.review_units(analysis_job_id, status, lease_expires_at, sequence_number);

create or replace function public.claim_analysis_stage(
  p_job_id uuid,
  p_allowed_statuses text[],
  p_next_status text,
  p_current_stage text,
  p_lease_seconds integer default 120
) returns table (
  id uuid,
  owner_id uuid,
  project_id uuid,
  upload_id uuid,
  status text,
  stage_cursor integer,
  stage_metadata_json jsonb,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  update public.analysis_jobs as j
  set status = p_next_status,
      current_stage = p_current_stage,
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)),
      last_heartbeat_at = now()
  where j.id = p_job_id
    and j.status = any(p_allowed_statuses)
    and (j.lease_expires_at is null or j.lease_expires_at < now())
    and j.cancel_requested_at is null
  returning j.id, j.owner_id, j.project_id, j.upload_id, j.status,
            j.stage_cursor, j.stage_metadata_json, j.lease_token;
end;
$$;

create or replace function public.claim_review_units(
  p_job_id uuid,
  p_limit integer default 3,
  p_lease_seconds integer default 300
) returns setof public.review_units
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select u.id
    from public.review_units u
    where u.analysis_job_id = p_job_id
      and (u.status = 'PENDING' or (u.status = 'PROCESSING' and u.lease_expires_at < now()))
    order by u.sequence_number
    for update skip locked
    limit greatest(1, least(p_limit, 3))
  )
  update public.review_units as u
  set status = 'PROCESSING',
      attempt_count = u.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
      started_at = coalesce(u.started_at, now()),
      last_heartbeat_at = now()
  from candidates c
  where u.id = c.id
  returning u.*;
end;
$$;

revoke all on function public.claim_analysis_stage(uuid, text[], text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_review_units(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_analysis_stage(uuid, text[], text, text, integer) to service_role;
grant execute on function public.claim_review_units(uuid, integer, integer) to service_role;

drop trigger if exists reports_updated on public.reports;
create trigger reports_updated before update on public.reports
for each row execute procedure public.set_updated_at();
