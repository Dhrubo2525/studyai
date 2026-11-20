-- Supabase/PostgreSQL production schema. Run with the Supabase SQL editor or CLI.
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', education_level text not null default '', institution_name text not null default '',
  preferred_language text not null default 'en' check (preferred_language in ('en','bn')),
  preferred_theme text not null default 'dark' check (preferred_theme in ('dark','light')),
  daily_study_hours numeric not null default 2 check (daily_study_hours between 0.5 and 16),
  available_weekdays integer[] not null default array[0,1,2,3,4,5,6],
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_name text not null, course_code text not null default '', description text not null default '', academic_level text not null default '',
  exam_date date, preferred_language text not null default 'en' check (preferred_language in ('en','bn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, file_name text not null,
  storage_path text not null unique, file_type text not null, file_size bigint not null check (file_size <= 15728640),
  page_count integer not null default 0, processing_status text not null default 'processed', created_at timestamptz not null default now()
);
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, course_id uuid not null references public.courses(id) on delete cascade,
    chunk_text text not null, page_number integer not null, embedding vector(1024), embedding_model text,
    created_at timestamptz not null default now()
);
create index if not exists document_chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists document_chunks_course_idx on public.document_chunks(course_id);
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  parent_topic_id uuid references public.topics(id) on delete set null, topic_name text not null, description text not null default '',
  difficulty_level text not null default 'medium', estimated_minutes integer not null default 45,
  source_document_id uuid references public.documents(id) on delete set null, source_page integer, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, exam_date date not null,
  daily_available_minutes integer not null, available_weekdays integer[] not null default array[0,1,2,3,4,5,6],
  plan_status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.plan_previews (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, details jsonb not null,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id,created_at);
create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(), study_plan_id uuid not null references public.study_plans(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null, task_title text not null, task_type text not null default 'study',
  scheduled_date date not null, estimated_minutes integer not null, priority text not null default 'normal',
  completion_status text not null default 'pending', completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, title text not null,
  topic_id uuid references public.topics(id) on delete set null, difficulty text not null, total_questions integer not null,
  language text not null default 'en', created_at timestamptz not null default now()
);
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null, question_text text not null, question_type text not null,
  options jsonb not null, correct_answer text not null, explanation text not null default '',
  source_document_id uuid references public.documents(id) on delete set null, source_page integer
);
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade, score numeric not null,
  total_questions integer not null, correct_answers integer not null, time_spent integer not null default 0,
  completed_at timestamptz not null default now(), unique(user_id,quiz_id)
);
create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade, selected_answer text not null,
  is_correct boolean not null, created_at timestamptz not null default now()
);
create table if not exists public.topic_mastery (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, topic_id uuid not null references public.topics(id) on delete cascade,
  mastery_score numeric not null, mastery_status text not null, assessed_question_count integer not null default 0,
  last_assessed_at timestamptz, updated_at timestamptz not null default now(), unique(user_id,topic_id)
);
create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, title text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  role text not null check(role in ('user','assistant')), message_content text not null, citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.topics enable row level security;
alter table public.study_plans enable row level security;
alter table public.plan_previews enable row level security;
alter table public.ai_usage enable row level security;
alter table public.study_tasks enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.topic_mastery enable row level security;
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own courses" on public.courses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own documents" on public.documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chunks" on public.document_chunks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own topics" on public.topics for all using (exists(select 1 from public.courses c where c.id=course_id and c.user_id=auth.uid())) with check (exists(select 1 from public.courses c where c.id=course_id and c.user_id=auth.uid()));
create policy "own plans" on public.study_plans for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own plan previews" on public.plan_previews for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own ai usage" on public.ai_usage for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "tasks through plan" on public.study_tasks for all using (exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid())) with check (exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()));
create policy "own quizzes" on public.quizzes for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "questions through quiz" on public.quiz_questions for all using (exists(select 1 from public.quizzes q where q.id=quiz_id and q.user_id=auth.uid())) with check (exists(select 1 from public.quizzes q where q.id=quiz_id and q.user_id=auth.uid()));
create policy "own attempts" on public.quiz_attempts for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "answers through attempt" on public.quiz_answers for all using (exists(select 1 from public.quiz_attempts a where a.id=attempt_id and a.user_id=auth.uid())) with check (exists(select 1 from public.quiz_attempts a where a.id=attempt_id and a.user_id=auth.uid()));
create policy "own mastery" on public.topic_mastery for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own conversations" on public.tutor_conversations for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "messages through conversation" on public.tutor_messages for all using (exists(select 1 from public.tutor_conversations c where c.id=conversation_id and c.user_id=auth.uid())) with check (exists(select 1 from public.tutor_conversations c where c.id=conversation_id and c.user_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('study-materials','study-materials',false,15728640,array['application/pdf','text/plain'])
on conflict (id) do nothing;
create policy "private student file access" on storage.objects for all
using (bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
