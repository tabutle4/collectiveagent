# Collective Agent - Collective Realty Co.

Full-service agent platform and onboarding system

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Styling**: Tailwind CSS (Luxury theme)
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend
- **Hosting**: Vercel
- **Domain**: coachingbrokeragetools.com

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the SQL schema from `supabase-schema.sql` in your Supabase SQL editor
3. Get your project URL and API keys from Settings > API

### 3. Set Up Resend

1. Create a Resend account at https://resend.com
2. Add and verify your domain (coachingbrokeragetools.com)
3. Get your API key from Settings > API Keys

### 4. Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your actual values:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
collective-agent/
├── app/
│   ├── api/              # API routes
│   ├── admin/            # Admin dashboard pages
│   ├── auth/             # Authentication pages (login, register, reset)
│   ├── prospective-agent-form/  # Public prospect form
│   ├── globals.css       # Global styles with Tailwind
│   └── layout.tsx        # Root layout
├── components/           # Reusable React components
├── lib/                  # Utilities (Supabase, email, etc.)
├── supabase-schema.sql   # Database schema
└── README.md
```

## Features - Stage 1

### Public
- ✅ Prospective Agent Form
- ✅ Success confirmation page
- ✅ Email notifications

### Admin (Login Required)
- ✅ User authentication (login, register, password reset)
- ✅ Admin dashboard with stats
- ✅ Prospects list (searchable, filterable)
- ✅ Prospect detail view with notes
- ✅ Admin user management

## Deployment

Deploy to Vercel:

```bash
vercel
```

Point your custom domain (coachingbrokeragetools.com) to Vercel in your DNS settings.

## Brand Guidelines

- Company name: **Collective Realty Co.** (always with period after Co.)
- Use **preferred names** when addressing users
- Language: Partnership-focused (join, request) not application-focused
- Colors: Black/white/gray luxury palette
- Typography: Trebuchet MS with elegant letter spacing

## Next Stages

- **Stage 2**: Payment & Requirements Tracking (Stripe, Dropbox Sign)
- **Stage 3**: Agent Activation & Checklist
- **Stage 4**: Full Agent Features (Roster, Profile, Orders)
- **Stage 5**: Admin Enhancements (Mass messaging, analytics)
