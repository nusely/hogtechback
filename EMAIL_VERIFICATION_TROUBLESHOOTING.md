# Email Verification Troubleshooting Guide

## Issue: Email Verification Not Working

If you're not receiving verification emails or getting "Failed to send verification email" errors, follow these steps:

## 🔍 Step 1: Check Backend Logs

The backend now provides detailed error messages. Check your backend logs (Render.com logs or local console) for:
- `❌ Error sending email via Resend:` - This will show the exact error
- `Resend API Error:` - This will show the specific Resend API error

## 🚨 Common Errors and Solutions

### Error: "Invalid from address" or "Domain not verified"

**Problem:** The domain `hogtechgh.com` is not verified in Resend.

**Solution 1: Verify Domain (Recommended for Production)**
1. Go to [Resend Dashboard → Domains](https://resend.com/domains)
2. Click "Add Domain"
3. Enter `hogtechgh.com`
4. Add the DNS records as instructed:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
5. Wait for verification (usually a few minutes)
6. Once verified, emails will work from both `support@hogtechgh.com` and `noreply@hogtechgh.com`

**Solution 2: Use Test Email (Quick Fix for Testing)**
Temporarily update your `.env` file to use Resend's test domain:

```env
RESEND_NOREPLY_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
RESEND_SUPPORT_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
```

This works immediately without domain verification, but emails will come from `onboarding@resend.dev`.

### Error: "Unauthorized API key" or "Invalid API key"

**Problem:** The `RESEND_API_KEY` is incorrect or expired.

**Solution:**
1. Go to [Resend Dashboard → API Keys](https://resend.com/api-keys)
2. Check if your API key exists and is active
3. If needed, create a new API key
4. Update `RESEND_API_KEY` in your `.env` file and Render.com environment variables

### Error: "Rate limit exceeded"

**Problem:** Too many emails sent in a short time.

**Solution:**
- Wait a few minutes and try again
- Check your Resend plan limits
- Consider upgrading your Resend plan if needed

## 🔧 Quick Fix: Test with Resend Test Domain

If you need verification emails working immediately for testing:

1. **Update Backend `.env` file:**
```env
RESEND_NOREPLY_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
RESEND_SUPPORT_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
```

2. **Update Render.com Environment Variables:**
   - Go to your Render.com dashboard
   - Navigate to your backend service
   - Go to Environment → Environment Variables
   - Update `RESEND_NOREPLY_EMAIL` and `RESEND_SUPPORT_EMAIL` to use `onboarding@resend.dev`
   - Redeploy your service

3. **Test again:**
   - Try signing up or resending verification email
   - Check your email inbox (including spam folder)
   - Emails will come from `onboarding@resend.dev`

## 📋 Verification Checklist

- [ ] `RESEND_API_KEY` is set in `.env` and Render.com
- [ ] `RESEND_NOREPLY_EMAIL` is set correctly
- [ ] Domain `hogtechgh.com` is verified in Resend (or using test domain)
- [ ] Backend logs show no errors
- [ ] Check spam/junk folder for verification emails
- [ ] Try resending verification email from the frontend

## 🐛 Debug Steps

1. **Check Backend Logs:**
   ```bash
   # If running locally
   npm run dev
   
   # Look for:
   # ✅ Resend email service initialized
   # ✅ Verification email sent successfully via Resend to: [email]
   # OR
   # ❌ Error sending email via Resend: [error details]
   ```

2. **Check Resend Dashboard:**
   - Go to [Resend Dashboard → Logs](https://resend.com/logs)
   - Look for failed email attempts
   - Check error messages

3. **Test Email Service:**
   - The backend now throws detailed errors
   - Check the error message in the frontend console
   - The error will tell you exactly what's wrong

## 📧 Email Configuration

Current configuration (from `.env`):
- **No-Reply Email:** Used for verification emails, password resets (automated)
- **Support Email:** Used for order confirmations, contact form (customer-facing)

Both emails need to be verified in Resend or use the test domain.

## 🔄 After Fixing

Once you've fixed the issue:
1. Restart your backend server
2. Try signing up again
3. Check your email inbox
4. Click the verification link
5. Your account should be verified

## 📞 Still Having Issues?

If you're still having problems:
1. Check the exact error message in backend logs
2. Check Resend Dashboard → Logs for detailed error information
3. Verify your Resend account is active and not suspended
4. Ensure your API key has the correct permissions

