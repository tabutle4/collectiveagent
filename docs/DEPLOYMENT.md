# Deployment Guide - Collective Agent

## 🎉 Stage 1 Complete!

Your Collective Agent platform is ready to deploy to Vercel.

## What's Been Built

✅ **Authentication System**
- Login page
- First user registration
- Password reset flow

✅ **Prospective Agent Form**
- Public form with all 17 fields
- Conditional logic (MLS, previous brokerage, how heard)
- Success confirmation page
- Luxury styling throughout

✅ **Admin Dashboard**
- Dashboard with stats
- Prospects list (searchable, filterable)
- Individual prospect detail view
- Status management
- Admin users list

✅ **Email Notifications**
- Luxury HTML templates
- Prospect welcome email
- Admin notifications
- Password reset emails
- Sent via Resend

✅ **Database**
- Supabase with complete schema
- Row Level Security enabled
- Two tables: users, prospects

---

## Deployment Steps

### 1. Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

### 2. Deploy to Vercel

**Option A: Using Vercel CLI**

```bash
cd /path/to/collective-agent
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? **Your account**
- Link to existing project? **No**
- Project name? **collective-agent** (or your choice)
- Directory? **./
**
- Override settings? **No**

**Option B: Using Vercel Dashboard**

1. Go to https://vercel.com
2. Click "Add New Project"
3. Import your Git repository (or upload files)
4. Vercel will auto-detect Next.js

### 3. Add Environment Variables in Vercel

In your Vercel project dashboard:

1. Go to **Settings → Environment Variables**
2. Add these variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://zuhqqtfnyjlvbpcprdhf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1aHFxdGZueWpsdmJwY3ByZGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNTUyMjAsImV4cCI6MjA3NjgzMTIyMH0.EP5nnbIpWoOVQ7jUrjnkuEJsGAmLY1oVLpS4pnlyjj4
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1aHFxdGZueWpsdmJwY3ByZGhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTI1NTIyMCwiZXhwIjoyMDc2ODMxMjIwfQ.YxuuI3nDmkTn4d2HwoRHBxRVw8IQcansJ00VcnTLUP8
RESEND_API_KEY=re_MPcnVzMr_G8sKQDjM7cZfgDyiPSzNN5jU
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
```

**Important:** Update `NEXT_PUBLIC_APP_URL` with your actual Vercel URL after first deployment.

3. Click **Save**
4. Redeploy the project

### 4. Connect Your Custom Domain

1. In Vercel dashboard, go to **Settings → Domains**
2. Add domain: `agent.coachingbrokeragetools.com`
3. Follow Vercel's instructions to update DNS at Ionos:
   - Add CNAME record: `agent` pointing to `cname.vercel-dns.com`
4. Wait for DNS propagation (can take up to 48 hours, usually minutes)

### 5. Update Environment Variable

Once subdomain is connected:
1. Update `NEXT_PUBLIC_APP_URL` to `https://agent.coachingbrokeragetools.com`
2. Save and redeploy

---

## Testing Your Deployment

### 1. Create First Admin User
1. Go to `https://coachingbrokeragetools.com/auth/register`
2. Register with your info
3. You'll be logged in automatically

### 2. Test Prospect Form
1. Go to `https://coachingbrokeragetools.com/prospective-agent-form`
2. Fill out the form
3. Submit
4. Check:
   - Success page displays
   - You receive welcome email
   - Admin receives notification email
   - Prospect appears in admin dashboard

### 3. Test Admin Functions
1. Log in at `/auth/login`
2. View dashboard
3. Click through to prospects list
4. View individual prospect
5. Update status
6. Check admin users page

---

## Post-Deployment Configuration

### Update Email Links

In your existing Microsoft Form emails, update the "Join Now" link to point to your new form:
`https://coachingbrokeragetools.com/prospective-agent-form`

### Update coachingbrokerage.com

On your main website, update the CTA button on the /join-our-firm page to link to:
`https://coachingbrokeragetools.com/prospective-agent-form`

---

## Troubleshooting

**Emails not sending?**
- Check Resend dashboard for errors
- Verify domain is verified in Resend
- Check environment variables are set correctly

**Can't log in?**
- Make sure you created first user via `/auth/register`
- Check browser console for errors
- Verify Supabase credentials in environment variables

**Prospects not saving?**
- Check browser console for errors
- Verify Supabase credentials
- Check Supabase dashboard for RLS policies

**Build fails?**
- Check Vercel build logs
- Ensure all dependencies are in package.json
- Verify TypeScript has no errors

---

## Next Steps - Stage 2

Once Stage 1 is deployed and tested, we'll build:

- **Payment Integration** (Stripe for onboarding fees)
- **Dropbox Sign Integration** (track document completion)
- **Admin activation workflow** (activate agents once requirements complete)
- **Email sequence triggers**

---

## Support

If you run into any issues during deployment:
1. Check Vercel build logs
2. Check browser console
3. Check Supabase logs
4. Let me know and I'll help troubleshoot!

---

## Success! 🎉

Your Collective Agent app is now live and ready to replace Base44 for prospect management!
