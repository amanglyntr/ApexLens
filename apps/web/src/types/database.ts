export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type ProjectRow = { id: string; owner_id: string; name: string; description: string | null; status: string; created_at: string; updated_at: string; last_analysis_at: string | null }
type JobRow = {
  id: string; project_id: string; upload_id: string | null; owner_id: string; status: string; current_stage: string; progress_percentage: number;
  total_files: number; supported_files: number; included_files: number; excluded_files: number; unsupported_files: number;
  total_review_units: number; completed_review_units: number; failed_review_units: number; critical_count: number; major_count: number;
  moderate_count: number; minor_count: number; informational_count: number; created_at: string; updated_at: string; completed_at: string | null;
  masked_error_code: string | null; masked_error_message: string | null;
}
type FindingRow = {
  id: string; analysis_job_id: string; category: string; subcategory: string; severity: string; confidence: string; title: string; issue: string;
  masked_file_path: string | null; method_name: string | null; line_start: number | null; line_end: number | null; evidence: string; impact: string;
  standard_violated: string | null; recommendation: string; validation_status: string; created_at: string;
}
type ReportRow = {
  id: string; analysis_job_id: string; version: number; status: string; overall_score: number | null; overall_grade: string | null;
  category_scores_json: Json; architecture_summary: string | null; top_recommendations_json: Json; limitations_json: Json;
  html_storage_path: string | null; json_storage_path: string | null; csv_storage_path: string | null; markdown_storage_path: string | null;
  zip_storage_path: string | null; pdf_storage_path: string | null; created_at: string; updated_at: string;
}
type ObservationRow = { id: string; analysis_job_id: string; review_unit_id: string | null; title: string; description: string; created_at: string }
type RepositoryFileRow = { id: string; analysis_job_id: string; file_type: string; metadata_type: string | null; status: string }
type ProfileRow = { id: string; display_name: string | null; role: string; approval_status: string; approved_by: string | null; approved_at: string | null; created_at: string; updated_at: string }
type AnthropicUsageByJobRow = {
  analysis_job_id: string; api_calls: number; successful_calls: number; rejected_calls: number;
  input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number;
}

export interface Database {
  public: {
    Tables: {
      projects: { Row: ProjectRow; Insert: { id?: string; owner_id: string; name: string; description?: string | null; status?: string }; Update: Partial<Omit<ProjectRow, 'id' | 'owner_id' | 'created_at'>>; Relationships: [] }
      analysis_jobs: { Row: JobRow; Insert: Partial<JobRow> & { project_id: string; owner_id: string }; Update: Partial<JobRow>; Relationships: [] }
      findings: { Row: FindingRow; Insert: Partial<FindingRow> & { analysis_job_id: string; category: string; subcategory: string; severity: string; confidence: string; title: string; issue: string; evidence: string; impact: string; recommendation: string }; Update: Partial<FindingRow>; Relationships: [] }
      reports: { Row: ReportRow; Insert: Partial<ReportRow> & { analysis_job_id: string; status: string }; Update: Partial<ReportRow>; Relationships: [] }
      positive_observations: { Row: ObservationRow; Insert: Omit<ObservationRow, 'id' | 'created_at'>; Update: Partial<ObservationRow>; Relationships: [] }
      repository_files: { Row: RepositoryFileRow; Insert: Partial<RepositoryFileRow> & { analysis_job_id: string; file_type: string; status: string }; Update: Partial<RepositoryFileRow>; Relationships: [] }
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow> & { id: string }; Update: Partial<ProfileRow>; Relationships: [] }
    }
    Views: {
      anthropic_usage_by_job: { Row: AnthropicUsageByJobRow; Relationships: [] }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
