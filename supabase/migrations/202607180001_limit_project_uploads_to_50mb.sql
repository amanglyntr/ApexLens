update storage.buckets
set file_size_limit = 52428800
where id in ('project-uploads', 'masked-analysis', 'report-exports');
