  -- RLS decides which rows authenticated users may access; table grants decide
  -- which operations are available at all. Edge Functions use service_role.
  grant usage on schema public to authenticated, service_role;

  grant select on table public.profiles to authenticated;
  grant select, insert, update, delete on table public.projects to authenticated;
  grant select, insert on table public.project_uploads to authenticated;
  grant select on table public.analysis_jobs to authenticated;
  grant select on table public.repository_files to authenticated;
  grant select on table public.review_units to authenticated;
  grant select on table public.review_unit_files to authenticated;
  grant select on table public.findings to authenticated;
  grant select on table public.finding_locations to authenticated;
  grant select on table public.positive_observations to authenticated;
  grant select on table public.reports to authenticated;
  grant select on table public.audit_events to authenticated;

  grant all privileges on table
    public.profiles,
    public.projects,
    public.project_uploads,
    public.analysis_jobs,
    public.repository_files,
    public.review_units,
    public.review_unit_files,
    public.findings,
    public.finding_locations,
    public.positive_observations,
    public.reports,
    public.audit_events
  to service_role;

  grant usage, select on all sequences in schema public to service_role;
