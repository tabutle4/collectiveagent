# Email Configuration Guide

## Multiple FROM Email Addresses

The app now supports different FROM email addresses for different purposes. This makes emails more organized and professional.

### Current Email Addresses

All emails are configured in `/lib/email.ts`:

```typescript
const FROM_EMAILS = {
  onboarding: 'Collective Realty Co. <onboarding@coachingbrokeragetools.com>',
  support: 'Collective Support <support@coachingbrokeragetools.com>',
  notifications: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
  office: 'Collective Realty Co. <office@collectiverealtyco.com>',
  admin: 'Collective Admin <admin@coachingbrokeragetools.com>',
}
```

### Current Usage

**Onboarding** (`onboarding@coachingbrokeragetools.com`)
- Prospect welcome emails
- New agent information emails

**Support** (`support@coachingbrokeragetools.com`)
- Password reset emails
- Help/support related emails

**Notifications** (`notifications@coachingbrokeragetools.com`)
- Admin notifications when new prospects submit
- System alerts

**Office** (`office@collectiverealtyco.com`)
- Official communications
- Available but not currently used

**Admin** (`admin@coachingbrokeragetools.com`)
- Admin-specific emails
- Available but not currently used

---

## Adding New FROM Addresses

To add a new FROM email address:

1. Open `/lib/email.ts`
2. Add to the `FROM_EMAILS` object:
   ```typescript
   const FROM_EMAILS = {
     // ... existing emails
     billing: 'Collective Billing <billing@coachingbrokeragetools.com>',
   }
   ```
3. Use it in your email function:
   ```typescript
   return resend.emails.send({
     from: FROM_EMAILS.billing,
     to: recipientEmail,
     subject: 'Your subject',
     html: yourHtml,
   })
   ```

**No need to verify each email in Resend!** Once the domain is verified, ANY email address at that domain works automatically.

---

## Verified Domains in Resend

You need these domains verified in your Resend account:
- ✅ `coachingbrokeragetools.com` (main domain for most emails)
- ✅ `collectiverealtyco.com` (for office@ emails)

Once verified, you can use:
- `anything@coachingbrokeragetools.com`
- `anything@collectiverealtyco.com`

---

## Best Practices

### DO:
- ✅ Use descriptive email names (`onboarding@`, `support@`)
- ✅ Use different addresses for different purposes
- ✅ Use the domain users will recognize

### DON'T:
- ❌ Use `noreply@` for important emails (people can't respond)
- ❌ Change FROM addresses too frequently (confuses recipients)
- ❌ Use personal emails for system notifications

---

## Examples of Future Email Types

If you expand the system, you might add:

- `billing@` - Payment confirmations, invoices
- `training@` - Training materials, course emails
- `events@` - Event invitations, webinar notifications
- `newsletter@` - Company newsletters
- `compliance@` - Compliance-related communications

---

## Current Email Functions

1. **sendProspectWelcomeEmail()** - Uses `FROM_EMAILS.onboarding`
2. **sendAdminProspectNotification()** - Uses `FROM_EMAILS.notifications`
3. **sendPasswordResetEmail()** - Uses `FROM_EMAILS.support`

---

**All emails are styled with the luxury email template to match your brand!**
