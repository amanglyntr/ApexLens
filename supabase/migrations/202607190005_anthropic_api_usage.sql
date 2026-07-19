-- Per-call provider usage attribution. Never store prompts, responses, source code, or secrets here.
create table if not exists public.anthropic_api_usage (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  review_unit_id uuid references public.review_units(id) on delete set null,
  stage text not null check (stage in ('REVIEW', 'VALIDATION', 'REPORT')),
  model text not null check (char_length(model) between 1 and 120),
  provider_request_id text unique,
  response_status text not null check (response_status in ('API_SUCCEEDED', 'API_REJECTED')),
  http_status smallint not null check (http_status between 100 and 599),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  cache_creation_input_tokens bigint check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens bigint check (cache_read_input_tokens >= 0),
  provider_error_type text check (provider_error_type is null or char_length(provider_error_type) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists anthropic_api_usage_job_created_idx
  on public.anthropic_api_usage(analysis_job_id, created_at desc);

alter table public.anthropic_api_usage enable row level security;

create policy "approved owners read Anthropic usage"
  on public.anthropic_api_usage for select to authenticated
  using ((select public.is_approved_user()) and exists (
    select 1 from public.analysis_jobs j
    where j.id = analysis_job_id and j.owner_id = (select auth.uid())
  ));

revoke all on table public.anthropic_api_usage from public, anon;
grant select on table public.anthropic_api_usage to authenticated;
grant all privileges on table public.anthropic_api_usage to service_role;

create or replace view public.anthropic_usage_by_job
with (security_invoker = true)
as
select
  analysis_job_id,
  count(*)::bigint as api_calls,
  count(*) filter (where response_status = 'API_SUCCEEDED')::bigint as successful_calls,
  count(*) filter (where response_status = 'API_REJECTED')::bigint as rejected_calls,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_input_tokens,
  coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_input_tokens
from public.anthropic_api_usage
group by analysis_job_id;

revoke all on table public.anthropic_usage_by_job from public, anon;
grant select on table public.anthropic_usage_by_job to authenticated, service_role;
