-- Salesforce Apex Lens foundation: schema, ownership boundaries, and private storage.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80), description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_analysis_at timestamptz
);

create table public.project_uploads (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, storage_path text not null,
  original_filename_masked text not null, compressed_size bigint not null check (compressed_size >= 0), repository_hash text,
  status text not null default 'UPLOADED', created_at timestamptz not null default now(), expires_at timestamptz not null
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  upload_id uuid references public.project_uploads(id) on delete restrict, owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'UPLOADED', current_stage text not null default 'Secure upload',
  progress_percentage smallint not null default 0 check (progress_percentage between 0 and 100),
  total_files integer not null default 0, supported_files integer not null default 0, included_files integer not null default 0,
  excluded_files integer not null default 0, unsupported_files integer not null default 0,
  total_review_units integer not null default 0, completed_review_units integer not null default 0, failed_review_units integer not null default 0,
  critical_count integer not null default 0, major_count integer not null default 0, moderate_count integer not null default 0,
  minor_count integer not null default 0, informational_count integer not null default 0,
  prompt_version text not null default 'review-v1', scoring_version text not null default 'score-v1', model_version text,
  retry_count integer not null default 0, last_heartbeat_at timestamptz, started_at timestamptz, completed_at timestamptz,
  expires_at timestamptz, masked_error_code text, masked_error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.repository_files (
  id uuid primary key default gen_random_uuid(), analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  relative_path_masked text not null, storage_path_masked text, file_type text not null, metadata_type text,
  file_hash text not null, size_bytes bigint not null check (size_bytes >= 0), status text not null,
  contains_sensitive_data boolean not null default false, is_excluded boolean not null default false, exclusion_reason text,
  created_at timestamptz not null default now()
);

create table public.review_units (
  id uuid primary key default gen_random_uuid(), analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  sequence_number integer not null, review_type text not null, status text not null default 'PENDING', attempt_count integer not null default 0,
  estimated_input_tokens integer, started_at timestamptz, completed_at timestamptz, last_heartbeat_at timestamptz,
  masked_error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (analysis_job_id, sequence_number)
);

create table public.review_unit_files (
  review_unit_id uuid not null references public.review_units(id) on delete cascade,
  repository_file_id uuid not null references public.repository_files(id) on delete cascade,
  primary key (review_unit_id, repository_file_id)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(), analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  review_unit_id uuid references public.review_units(id) on delete set null, finding_fingerprint text not null,
  category text not null, subcategory text not null,
  severity text not null check (severity in ('CRITICAL','MAJOR','MODERATE','MINOR','INFORMATIONAL')),
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW')), title text not null, issue text not null,
  masked_file_path text, class_or_component text, method_name text, line_start integer, line_end integer,
  evidence_type text not null, evidence text not null, impact text not null, standard_violated text,
  recommendation text not null, masked_refactored_code text,
  validation_status text not null default 'PRELIMINARY' check (validation_status in ('PRELIMINARY','VALIDATED','REJECTED','DUPLICATE')),
  duplicate_of uuid references public.findings(id) on delete set null, source text not null default 'REVIEW_UNIT',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (analysis_job_id, finding_fingerprint)
);

create table public.finding_locations (
  id uuid primary key default gen_random_uuid(), finding_id uuid not null references public.findings(id) on delete cascade,
  masked_file_path text not null, method_name text, line_start integer, line_end integer
);

create table public.positive_observations (
  id uuid primary key default gen_random_uuid(), analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  review_unit_id uuid references public.review_units(id) on delete set null, title text not null, description text not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(), analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  version integer not null default 1, status text not null, overall_score numeric(5,2), overall_grade text,
  category_scores_json jsonb not null default '{}'::jsonb, html_storage_path text, json_storage_path text,
  csv_storage_path text, markdown_storage_path text, zip_storage_path text, pdf_storage_path text,
  created_at timestamptz not null default now(), unique (analysis_job_id, version)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null, analysis_job_id uuid references public.analysis_jobs(id) on delete set null,
  event_type text not null, masked_metadata_json jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects(owner_id);
create index jobs_owner_updated_idx on public.analysis_jobs(owner_id, updated_at desc);
create index files_job_idx on public.repository_files(analysis_job_id);
create index review_units_claim_idx on public.review_units(analysis_job_id, status, sequence_number);
create index findings_job_filter_idx on public.findings(analysis_job_id, validation_status, severity);
create index audit_owner_created_idx on public.audit_events(owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_uploads enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.repository_files enable row level security;
alter table public.review_units enable row level security;
alter table public.review_unit_files enable row level security;
alter table public.findings enable row level security;
alter table public.finding_locations enable row level security;
alter table public.positive_observations enable row level security;
alter table public.reports enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "projects owner access" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "uploads owner read" on public.project_uploads for select using (owner_id = auth.uid());
create policy "uploads owner insert" on public.project_uploads for insert with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "jobs owner read" on public.analysis_jobs for select using (owner_id = auth.uid());
create policy "files through owned job" on public.repository_files for select using (exists (select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = auth.uid()));
create policy "units through owned job" on public.review_units for select using (exists (select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = auth.uid()));
create policy "unit files through owned unit" on public.review_unit_files for select using (exists (select 1 from public.review_units u join public.analysis_jobs j on j.id = u.analysis_job_id where u.id = review_unit_id and j.owner_id = auth.uid()));
create policy "findings through owned job" on public.findings for select using (exists (select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = auth.uid()));
create policy "locations through owned finding" on public.finding_locations for select using (exists (select 1 from public.findings f join public.analysis_jobs j on j.id = f.analysis_job_id where f.id = finding_id and j.owner_id = auth.uid()));
create policy "observations through owned job" on public.positive_observations for select using (exists (select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = auth.uid()));
create policy "reports through owned job" on public.reports for select using (exists (select 1 from public.analysis_jobs j where j.id = analysis_job_id and j.owner_id = auth.uid()));
create policy "audit owner read" on public.audit_events for select using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit) values
  ('project-uploads', 'project-uploads', false, 52428800),
  ('masked-analysis', 'masked-analysis', false, 52428800),
  ('report-exports', 'report-exports', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "users upload to own prefix" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read own uploads" on storage.objects for select to authenticated
  using (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read own reports" on storage.objects for select to authenticated
  using (bucket_id = 'report-exports' and (storage.foldername(name))[1] = auth.uid()::text);
-- masked-analysis intentionally has no end-user policy; only service-role functions can access it.

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger projects_updated before update on public.projects for each row execute procedure public.set_updated_at();
create trigger jobs_updated before update on public.analysis_jobs for each row execute procedure public.set_updated_at();
create trigger units_updated before update on public.review_units for each row execute procedure public.set_updated_at();
create trigger findings_updated before update on public.findings for each row execute procedure public.set_updated_at();
