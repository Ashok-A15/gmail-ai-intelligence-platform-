# Gmail AI Intelligence Platform

An AI-powered Gmail Intelligence Platform that integrates Gmail, Google Gemini, NVIDIA NIM, and Supabase to provide intelligent email management, semantic search, automated summarization, email categorization, AI-generated replies, and conversational email intelligence.

---

## Live Demo

🌐 Live Application

https://gmail-ai-intelligence-platform-99odf61ep.vercel.app/

📂 GitHub Repository

https://github.com/Ashok-A15/gmail-ai-intelligence-platform-

---

## Project Overview

This project was developed as part of the Repeatless AI Automation Executive Technical Assessment.

The platform securely connects to a user's Gmail account, synchronizes emails and threads, generates AI-powered summaries, categorizes incoming emails, drafts intelligent replies, and provides a conversational AI assistant capable of answering questions using the user's email history.

---

## Features

### Gmail Integration

* Google OAuth 2.0 Authentication
* Gmail API Integration
* Secure Account Connection
* Gmail Thread Synchronization
* Incremental Email Sync
* Pagination Support
* Metadata Extraction
* Gmail Thread Awareness

### AI Email Intelligence

#### Email Summarization

* Individual Email Summaries
* Thread-Level Summaries
* Context-Aware Summarization

#### Email Categorization

Automatically categorizes emails into:

* Job / Recruitment
* Newsletters
* Finance
* Notifications
* Personal
* Work / Professional

### AI Compose & Reply

#### Compose New Email

Generate complete professional emails from natural language prompts.

Example:

> Write a follow-up email regarding interview feedback.

#### Thread-Aware Replies

* Understands complete conversation history
* Generates contextually accurate replies
* Preserves Gmail thread structure

### Conversational AI Chat Agent

Ask questions about your emails using natural language.

Examples:

* Summarize all emails from LinkedIn this month
* Which companies contacted me regarding jobs?
* List all newsletters received this week
* What discussions happened about Deloitte?
* Show all recruitment-related emails

Features:

* Retrieval-Augmented Generation (RAG)
* Semantic Search
* Context-Aware Responses
* Source Attribution
* Cross-Email Reasoning

### Newsletter Intelligence

* Newsletter Detection
* Semantic Clustering
* Duplicate News Removal
* Unified News Digest Generation

---

## Technology Stack

### Frontend

* Next.js 15
* React
* TypeScript
* Tailwind CSS

### Backend

* Next.js API Routes
* Node.js

### Database

* Supabase PostgreSQL
* pgvector

### AI Models

#### Google Gemini

* Gemini 2.5 Flash
* Gemini Embedding 2

#### NVIDIA NIM

* Llama 3.1 8B Instruct

### External APIs

* Gmail API
* Google OAuth 2.0

---

## Assignment Requirements Coverage

| Requirement                    | Status |
| ------------------------------ | ------ |
| Gmail OAuth 2.0 Authentication | ✅      |
| Gmail Email Sync               | ✅      |
| Incremental Sync               | ✅      |
| Email Summarization            | ✅      |
| Thread Summarization           | ✅      |
| Email Categorization           | ✅      |
| AI Compose Email               | ✅      |
| Thread-Aware Reply Generation  | ✅      |
| Gmail Thread Handling          | ✅      |
| AI Chat Agent                  | ✅      |
| Source Attribution             | ✅      |
| Cross-Email Reasoning          | ✅      |
| Supabase Integration           | ✅      |
| PostgreSQL Database            | ✅      |
| pgvector Semantic Search       | ✅      |
| Gemini Integration             | ✅      |
| NVIDIA NIM Integration         | ✅      |
| Newsletter Deduplication       | ✅      |

---

## System Architecture

```text
User
 │
 ▼
Next.js Frontend
 │
 ▼
Next.js API Routes
 │
 ├── Gmail API
 ├── Google Gemini API
 ├── NVIDIA NIM API
 └── Supabase
        │
        ├── PostgreSQL
        └── pgvector
```

---

## Project Structure

```text
gmail-ai-intelligence-platform/

├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── setup/
│   │   ├── dashboard/
│   │   └── page.tsx
│   │
│   ├── components/
│   │
│   ├── lib/
│   │   ├── gmail.ts
│   │   ├── ai.ts
│   │   ├── dedup.ts
│   │   ├── rag.ts
│   │   └── supabase.ts
│   │
│   └── types/
│
├── supabase_schema.sql
├── Architecture.md
├── README.md
├── .env.example
└── package.json
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/Ashok-A15/gmail-ai-intelligence-platform-.git
cd gmail-ai-intelligence-platform-
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a file named:

```bash
.env.local
```

Copy values from:

```bash
.env.example
```

### Start Development Server

```bash
npm run dev
```

Application will be available at:

```text
http://localhost:3000
```

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=

SUPABASE_SERVICE_ROLE_KEY=

GEMINI_API_KEY=

NVIDIA_API_KEY=

GOOGLE_CLIENT_ID=

GOOGLE_CLIENT_SECRET=

GOOGLE_REDIRECT_URI=
```

---

## Database Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Execute:

```sql
supabase_schema.sql
```

This creates:

* users
* threads
* emails
* email_embeddings

tables along with vector search support.

---

## Gmail Setup

1. Create a Google Cloud Project.
2. Enable Gmail API.
3. Configure OAuth Consent Screen.
4. Create OAuth Credentials.
5. Add redirect URI:

```text
http://localhost:3000/api/auth/callback
```

---

## AI Design

### Email Summarization

Google Gemini 2.5 Flash is used to generate:

* Email summaries
* Thread summaries
* AI-generated email drafts

### Email Categorization

NVIDIA NIM (Llama 3.1) categorizes emails into predefined categories.

### Embeddings

Gemini Embedding 2 converts email content into 768-dimensional vectors stored in pgvector.

### Retrieval-Augmented Generation (RAG)

Workflow:

1. User asks a question.
2. Query is converted into embeddings.
3. Relevant emails are retrieved using vector similarity search.
4. Gemini generates grounded responses.
5. Source emails are attached to every response.

---

## Key Technical Challenges Solved

### Database Connectivity Issues

Resolved Supabase DNS and project configuration issues causing database connection failures.

### Authentication State Management

Implemented proper cookie handling and frontend session synchronization.

### Gemini Model Migration

Migrated from legacy Gemini models to:

* Gemini 2.5 Flash
* Gemini Embedding 2

### Vector Search Optimization

Implemented pgvector HNSW indexing for efficient semantic search and retrieval.

---

## Future Improvements

* Real-time Gmail Push Notifications
* Multi-Account Support
* Background Job Queues
* Advanced Reranking
* Better Newsletter Clustering
* Team Collaboration Features
* Workflow Automation

---

## Documentation

Detailed system architecture and design decisions are available in:

```text
Architecture.md
```

---

## Author

Ashok

B.E. Computer Science Engineering

JSS Science and Technology University (JSSSTU)

Mysore, Karnataka

LinkedIn:
https://www.linkedin.com/in/mrashok5b772239/

GitHub:
https://github.com/Ashok-A15
