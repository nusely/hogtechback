# Resend Email Addresses Configuration

## ✅ Configuration

You're now using **two email addresses** for different purposes:

### 1. **Support Email** (`support@hogtechgh.com`)
**Used for:** Customer-facing emails where replies are expected
- ✅ Order confirmations
- ✅ Order status updates
- ✅ Order cancellations
- ✅ Admin notifications (order received)
- ✅ Contact form submissions
- ✅ Investment requests

**Why:** Customers can reply to these emails directly

### 2. **No-Reply Email** (`noreply@hogtechgh.com`)
**Used for:** Automated marketing notifications
- ✅ Wishlist reminders
- ✅ Cart abandonment emails
- ✅ Newsletter emails
- ✅ Automated marketing campaigns

**Why:** These are automated emails that don't require replies

## 📝 Environment Variables

In your `.env` file:
```env
RESEND_API_KEY=re_MnujjdYu_121DroDAHMe5fbZbAp1S8ccF
RESEND_SUPPORT_EMAIL=Hedgehog Technologies <support@hogtechgh.com>
RESEND_NOREPLY_EMAIL=Hedgehog Technologies <noreply@hogtechgh.com>
```

## ⚠️ Important: Domain Verification Required

**Both email addresses need to be verified in Resend:**

1. **Go to Resend Dashboard:** https://resend.com/domains
2. **Add your domain:** `hogtechgh.com`
3. **Add DNS records** as instructed:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
4. **Wait for verification** (usually a few minutes)

### After Verification:
- ✅ `support@hogtechgh.com` will work
- ✅ `noreply@hogtechgh.com` will work
- ✅ Both emails can send from your custom domain

### Before Verification:
- ❌ Emails will fail with "Invalid from address"
- 💡 Use `onboarding@resend.dev` for testing

## 🧪 Testing

To test before domain verification:
```env
RESEND_SUPPORT_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
RESEND_NOREPLY_EMAIL=Hedgehog Technologies <onboarding@resend.dev>
```

## 📊 Email Usage Summary

| Email Type | From Address | Can Reply? |
|------------|--------------|------------|
| Order Confirmation | support@hogtechgh.com | ✅ Yes |
| Order Status Update | support@hogtechgh.com | ✅ Yes |
| Order Cancellation | support@hogtechgh.com | ✅ Yes |
| Admin Notifications | support@hogtechgh.com | ✅ Yes |
| Contact Form | support@hogtechgh.com | ✅ Yes |
| Investment Request | support@hogtechgh.com | ✅ Yes |
| Wishlist Reminder | noreply@hogtechgh.com | ❌ No |
| Cart Abandonment | noreply@hogtechgh.com | ❌ No |
| Newsletter | noreply@hogtechgh.com | ❌ No |

## 🔧 How It Works in Code

The `sendEmail()` method now accepts a second parameter:
```typescript
// Use support email (default)
await sendEmail({...}, true);  // true = support email

// Use noreply email
await sendEmail({...}, false); // false = noreply email
```

## 📚 Next Steps

1. **Verify domain in Resend Dashboard**
2. **Update DNS records** for `hogtechgh.com`
3. **Wait for verification** (check Resend Dashboard)
4. **Test sending emails** after verification
5. **Monitor email delivery** in Resend Dashboard → Logs

