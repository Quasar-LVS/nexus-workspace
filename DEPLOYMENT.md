# Nexus — Production Deployment Runbook

This document details the configuration, environmental settings, and integration details necessary to deploy and maintain Nexus in production.

---

## 💻 Local Development

### 1. Prerequisite Installations
- **NodeJS**: `v20.x` or later is recommended.
- **npm**: `v10.x` or later.

### 2. Setup Commands
Install dependencies:
```bash
npm install
```

Launch the development server locally:
```bash
npm run dev
```
The application will start at `http://localhost:3000`.

---

## 🚀 Production Build & Run

To build the application for optimization:
```bash
npm run build
```

To run the compiled production bundle locally:
```bash
npm start
```

---

## 🔑 Environment Variables Audit

Verify that the following variables are configured in your hosting environment (e.g. Vercel dashboard or `.env.local` for local execution):

| Variable Name | Description / Requirement | Example Casing |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk API client publishable identifier. | `pk_test_...` or `pk_live_...` |
| `CLERK_SECRET_KEY` | Clerk server SDK private token. | `sk_test_...` or `sk_live_...` |
| `CLERK_WEBHOOK_SECRET` | Secret token to verify Svix signatures from Clerk events. | `whsec_...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase database project API URL. | `https://your-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side public Anon authorization key. | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Administrative service role key (bypasses RLS). | `eyJhbGciOi...` |
| `GEMINI_API_KEY` | Google Generative AI access key. | `AIzaSy...` |
| `OPENAI_API_KEY` | OpenAI API completion key. | `sk-proj-...` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key. | `sk-ant-...` |
| `KIMI_API_KEY` | Moonshot Kimi AI API key. | `sk-kimi-...` |

---

## 🗄️ Supabase Setup

### 1. Database Schema
Ensure all database migrations under the `/supabase/migrations` folder have been executed on the production database cluster.

### 2. Storage Buckets
Nexus requires a private storage bucket named `attachments` for file sharing and uploads.
- **Bucket ID**: `attachments`
- **Public access**: Disabled (Private)
- **Allowed MIME types**: `image/*`, `application/pdf`, `text/*`, `application/zip`

Ensure the database RLS policies grant read/write access to authenticated users based on workspace membership.

### 3. Realtime Replication
In your Supabase Dashboard, go to **Database > Replication** and verify that Realtime is enabled for the following tables to enable live updates:
- `messages`
- `saved_messages`
- `workspace_members`
- `tasks`
- `activity_logs`
- `notifications`

---

## 🔒 Clerk Authentication Setup

### 1. Redirect URLs
Set these parameters in your Clerk dashboard or environment variables:
- **Sign In URL**: `/sign-in`
- **Sign Up URL**: `/sign-up`
- **After Sign In / Sign Up Redirect**: `/workspace/select`

### 2. Webhook Event Synchronizer
To sync Clerk profiles to the Supabase database:
1. Navigate to the **Clerk Dashboard > Webhooks**.
2. Add a new endpoint pointing to: `https://your-domain.com/api/webhooks/clerk`
3. Select the following event subscriptions:
   - `user.created`
   - `user.updated`
   - `user.deleted`
4. Copy the **Signing Secret** and assign it to the `CLERK_WEBHOOK_SECRET` environment variable.

---

## 🤖 AI Providers & Mock Fallback

Nexus supports multi-model selection:
- **Gemini**: Handled via `@google/generative-ai` SDK.
- **OpenAI**: Handled via standard chat completion HTTP endpoints.
- **Claude / Kimi**: Handled via respective API endpoints.
- **Mock AI Provider**: If no api key is configured, the system automatically falls back to `MockAIProvider`. It simulates streaming SSE tokens and generates context-aware markdown workspace status summaries.

---

## 🌐 Cloud Deployment

### Deploying to Vercel (Recommended)
1. Import your GitHub repository to your Vercel project dashboard.
2. In **Project Settings**, add all required Environment Variables listed above.
3. Vercel automatically detects Next.js build presets.
4. Click **Deploy**. Vercel will automatically provision SSL certificates, compress bundles, and set up Edge/Serverless functions.
