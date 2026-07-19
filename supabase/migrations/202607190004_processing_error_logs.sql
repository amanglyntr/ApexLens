-- Technical pipeline diagnostics. Never store source code, prompts, secrets, or stack traces.
create table if not exists public.processing_error_logs (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  review_unit_id uuid references public.review_units(id) on delete cascade,
  function_name text not null check (char_length(function_name) between 1 and 80),
  stage text not null check (char_length(stage) between 1 and 80),
  error_code text not null check (char_length(error_code) between 1 and 120),
  error_name text not null check (char_length(error_name) between 1 and 120),
  technical_detail text not null check (char_length(technical_detail) between 1 and 1000),
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index if not exists processing_error_logs_job_created_idx
  on public.processing_error_logs(analysis_job_id, created_at desc);

alter table public.processing_error_logs enable row level security;
revoke all on table public.processing_error_logs from public, anon, authenticated;
grant all privileges on table public.processing_error_logs to service_role;
