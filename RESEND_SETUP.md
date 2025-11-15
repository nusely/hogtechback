# Resend Email API Integration

## ✅ What's Been Done

1. **Installed Resend SDK** - `npm install resend`
2. **Updated Email Services** - Both `email.service.ts` and `enhanced-email.service.ts` now use Resend
3. **Updated .env** - Added `RESEND_API_KEY` and `RESEND_FROM_EMAIL`

## 📝 Configuration

### Backend .env
```env
RESEND_API_KEY=re_MnujjdYu_121DroDAHMe5fbZbAp1S8ccF
RESEND_FROM_EMAIL=Hedgehog Technologies <support@hogtechgh.com>
```

## ⚠️ Important Notes

### 1. Domain Verification (Required for Custom Email)
To send emails from `support@hogtechgh.com`, you need to:

1. **Verify your domain in Resend Dashboard:**
   - Go to https://resend.com/domains
   - Add your domain (e.g., `hogtechgh.com`)
   - Add DNS records as instructed
   - Wait for verification (usually a few minutes)

2. **For Gmail addresses:**
   - Gmail doesn't allow sending from `@gmail.com` via third-party services
   - You should use a custom domain (e.g., `noreply@hogtechgh.com`)
   - Or use Resend's default domain for testing: `onboarding@resend.dev`

### 2. Testing Email
For testing, you can temporarily use:
```env
RESEND_FROM_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
```

This works immediately without domain verification.

### 3. Supabase Email Verification
**Note:** Supabase email verification (signup, password reset) still uses Supabase's email service by default. To use Resend for Supabase emails:

1. Go to Supabase Dashboard → Authentication → Settings → SMTP Settings
2. Configure Resend SMTP credentials:
   - Host: `smtp.resend.com`
   - Port: `587`
   - Username: `resend`
   - Password: Your Resend API key
   - From: Your verified domain email

## 📧 Email Types Using Resend

All backend emails now use Resend:
- ✅ Order confirmations
- ✅ Order status updates
- ✅ Order cancellations
- ✅ Admin notifications
- ✅ Wishlist reminders
- ✅ Cart abandonment emails
- ✅ Contact form submissions
- ✅ Investment requests

## 🧪 Testing

1. **Test order confirmation:**
   - Create an order
   - Check email inbox

2. **Test contact form:**
   - Submit contact form
   - Check email inbox

3. **Check logs:**
   - Look for `✅ Email sent successfully via Resend: [email-id]`
   - If errors, check `Error sending email via Resend:`

## 🔧 Troubleshooting

### Issue: "Invalid from address"
**Solution:** Verify your domain in Resend or use `onboarding@resend.dev` for testing

### Issue: "Unauthorized API key"
**Solution:** Check that `RESEND_API_KEY` is correct in `.env`

### Issue: Emails not sending
**Solution:**
1. Check Resend Dashboard → Logs for error details
2. Verify API key is correct
3. Check domain verification status
4. Ensure `RESEND_FROM_EMAIL` format is correct: `"Name <email@domain.com>"`

## 📚 Resources

- Resend Dashboard: https://resend.com
- Resend Documentation: https://resend.com/docs
- Resend API Reference: https://resend.com/docs/api-reference

