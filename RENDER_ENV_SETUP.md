# 🚨 CRITICAL: Render.com Environment Variables Setup

## Problem
If you're seeing CORS errors like:
```
Access to fetch at 'https://hogtech-backend.onrender.com/api/...' from origin 'https://hogtechfront.vercel.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

This means `FRONTEND_URL` is **NOT SET** in your Render.com backend environment variables.

---

## ✅ Solution: Set Environment Variables in Render.com

### Step 1: Go to Render Dashboard
1. Visit: https://dashboard.render.com
2. Select your backend service (e.g., **hogtech-backend**)
3. Go to: **Environment** tab (or **Settings** → **Environment Variables**)

### Step 2: Add Required Variables

Add these environment variables:

#### **Required Variables:**

```env
# Frontend URL (for CORS) - Add production custom domain, Vercel fallback, and development
FRONTEND_URL=https://hogtechgh.com,https://hogtechfront.vercel.app,http://localhost:3000

# Node Environment
NODE_ENV=production

# Port (Render sets this automatically, but you can set it explicitly)
PORT=5000

# Supabase Configuration
SUPABASE_URL=https://hrmxchfwiozifgpmjemf.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT Secret
JWT_SECRET=your-jwt-secret-here

# Email Service (Resend)
RESEND_API_KEY=your-resend-api-key
RESEND_SUPPORT_EMAIL=Hedgehog Technologies <support@hogtechgh.com>
RESEND_NOREPLY_EMAIL=Hedgehog Technologies <noreply@hogtechgh.com>

# Cloudflare R2 Storage
R2_ACCOUNT_ID=your-r2-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=hogtech-storage
R2_PUBLIC_URL=https://files.hogtechgh.com

# Trust Proxy (for accurate IP addresses behind Render's load balancer)
TRUST_PROXY=true
```

#### **Optional Variables:**

```env
# Payment Integration (Paystack)
PAYSTACK_SECRET_KEY=your-paystack-secret-key
PAYSTACK_PUBLIC_KEY=your-paystack-public-key

# Captcha (if using)
HCAPTCHA_SECRET=your-hcaptcha-secret
RECAPTCHA_SECRET=your-recaptcha-secret
```

### Step 3: Important - FRONTEND_URL Format

**⚠️ CRITICAL:** The `FRONTEND_URL` must include **ALL** frontend URLs, separated by commas:

```
FRONTEND_URL=https://hogtechgh.com,https://hogtechfront.vercel.app,http://localhost:3000
```

This allows:
- ✅ Production custom domain (`hogtechgh.com`) to access the backend
- ✅ Production Vercel site (fallback) to access the backend
- ✅ Local development to work

**Order matters:** Put your primary custom domain first, then Vercel URL, then localhost.

### Step 4: Redeploy

After adding environment variables:

1. Go to **Events** tab (or **Manual Deploy**)
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Or push a new commit to trigger auto-deploy

---

## 🔍 How to Verify

After redeploying, test the backend:

1. **Test CORS from production:**
   - Open browser console on `https://hogtechfront.vercel.app`
   - Try to sign up or make an API call
   - Should NOT see CORS errors

2. **Test backend health:**
   - Visit: `https://hogtech-backend.onrender.com/health`
   - Should return: `{"status":"ok","message":"Hogtech API is running"}`

3. **Check Render logs:**
   - Go to **Logs** tab in Render dashboard
   - Look for any CORS warnings or errors
   - Should see: `CORS: Allowing request from origin: https://hogtechfront.vercel.app`

---

## 📝 Example Configuration

Replace with your actual values:

```env
FRONTEND_URL=https://hogtechgh.com,https://hogtechfront.vercel.app,http://localhost:3000
NODE_ENV=production
PORT=5000
SUPABASE_URL=https://hrmxchfwiozifgpmjemf.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=your-secret-key-here
RESEND_API_KEY=re_your_key_here
TRUST_PROXY=true
```

---

## 🆘 Troubleshooting

### Issue: Still getting CORS errors

1. **Verify FRONTEND_URL format:**
   - Must be comma-separated: `https://hogtechfront.vercel.app,http://localhost:3000`
   - No spaces around commas
   - Include `https://` for production URLs

2. **Check Render logs:**
   - Look for: `CORS: Blocked request from origin: ...`
   - This tells you which origin is being blocked

3. **Verify environment variables are set:**
   - In Render dashboard → Environment tab
   - Make sure `FRONTEND_URL` is exactly as shown above
   - No trailing slashes

4. **Redeploy after changes:**
   - Environment variable changes require a redeploy
   - Go to Manual Deploy → Deploy latest commit

### Issue: Backend not starting

1. **Check required variables:**
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are required
   - `JWT_SECRET` is required
   - Missing variables will cause startup failures

2. **Check Render logs:**
   - Go to Logs tab
   - Look for startup errors
   - Common issues: missing env vars, database connection errors

---

## 📚 Related Documentation

- See `VERCEL_SUPABASE_SETUP.md` in frontend repo for frontend setup
- See `SECURITY_ASSESSMENT.md` for security configuration

---

## 🎯 Quick Checklist

Before going live:

- [ ] `FRONTEND_URL` includes production Vercel URL
- [ ] `FRONTEND_URL` includes `http://localhost:3000` for local dev
- [ ] `NODE_ENV=production` is set
- [ ] All Supabase credentials are set
- [ ] `JWT_SECRET` is set (use a strong random string)
- [ ] `TRUST_PROXY=true` is set (for accurate IP logging)
- [ ] Backend redeployed after adding env vars
- [ ] Tested API calls from production site
- [ ] No CORS errors in browser console

