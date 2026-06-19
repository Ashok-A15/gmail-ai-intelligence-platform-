-- AI-powered Gmail Intelligence Platform — Supabase Database Schema
-- Run this script in the Supabase SQL Editor to initialize your database.

-- 1. Enable the pgvector extension to store and query vector embeddings
create extension if not exists vector;

-- 2. Drop existing tables and functions if they exist (for clean setup)
drop function if exists match_email_embeddings;
drop table if exists email_embeddings;
drop table if exists emails;
drop table if exists threads;
drop table if exists users;

-- 3. Users Table
-- Stores user oauth tokens, profile details, and incremental sync state.
create table users (
  id varchar primary key, -- The user's Gmail address (acts as the primary identifier)
  email varchar not null,
  gmail_access_token text,
  gmail_refresh_token text,
  gmail_token_expires_at timestamptz,
  last_sync_time timestamptz,
  history_id varchar,
  created_at timestamptz default now()
);

-- 4. Threads Table
-- Represents email threads as a first-class concept.
create table threads (
  id varchar primary key, -- Gmail's threadId
  user_id varchar not null references users(id) on delete cascade,
  subject text,
  summary text, -- Thread-level summary
  category varchar, -- Thread-level category (majority vote or latest email category)
  last_updated_at timestamptz,
  created_at timestamptz default now()
);

-- Create an index on user_id and last_updated_at for fast inbox sorting
create index idx_threads_user_last_update on threads(user_id, last_updated_at desc);

-- 5. Emails Table
-- Stores individual message metadata, content, and headers for threading.
create table emails (
  id varchar primary key, -- Gmail's messageId
  thread_id varchar not null references threads(id) on delete cascade,
  user_id varchar not null references users(id) on delete cascade,
  from_name text,
  from_email text,
  to_name text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  snippet text,
  date timestamptz,
  category varchar, -- Individual email category (Newsletters, Job/Recruitment, Finance, Notifications, Personal, Work/Professional)
  summary text, -- Individual email summary
  message_id_header text, -- Message-ID header (used for threading)
  in_reply_to_header text, -- In-Reply-To header
  references_header text, -- References header
  is_read boolean default true,
  is_sent boolean default false,
  created_at timestamptz default now()
);

-- Create indexes for filtering emails
create index idx_emails_thread_id on emails(thread_id);
create index idx_emails_user_date on emails(user_id, date desc);
create index idx_emails_category on emails(user_id, category);

-- 6. Email Embeddings Table
-- Stores chunks of email body text and their vector embeddings (dimension = 768 for text-embedding-004)
create table email_embeddings (
  id uuid default gen_random_uuid() primary key,
  email_id varchar not null references emails(id) on delete cascade,
  thread_id varchar not null references threads(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(768), -- Vector column for Gemini embeddings
  created_at timestamptz default now()
);

-- Create an HNSW index for high-performance approximate nearest neighbor search
create index on email_embeddings using hnsw (embedding vector_cosine_ops);

-- 7. Cosine Similarity Match Function (RAG search)
-- Used by our Next.js API to retrieve context for the AI Chat Agent.
create or replace function match_email_embeddings(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id varchar
)
returns table (
  email_id varchar,
  thread_id varchar,
  chunk_text text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ee.email_id,
    ee.thread_id,
    ee.chunk_text,
    1 - (ee.embedding <=> query_embedding) as similarity
  from email_embeddings ee
  join emails e on e.id = ee.email_id
  where e.user_id = p_user_id
    and 1 - (ee.embedding <=> query_embedding) > match_threshold
  order by ee.embedding <=> query_embedding
  limit match_count;
end;
$$;
