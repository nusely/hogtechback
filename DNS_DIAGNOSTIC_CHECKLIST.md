# DNS Diagnostic Checklist for Error 1014

## ✅ What You've Confirmed

- `ftp.hogtechgh.com` → CNAME → `hogtechgh.com` (Proxied) ✅ **This is CORRECT and fine**

## 🔍 What to Check Next

### 1. Check Root Domain (`hogtechgh.com` or `@`)

**In Cloudflare DNS → Records, look for:**

```
Type: A (or AAAA)
Name: @ (or hogtechgh.com)
Content: [IP address]
Proxy: Proxied ✅
```

**OR if you see:**
```
Type: CNAME
Name: @ (or hogtechgh.com)
Target: [something]
```
**❌ THIS IS THE PROBLEM!** Root domain cannot be CNAME.

**Action:** If root domain has CNAME, delete it and add A record pointing to your Vercel/hosting IP.

---

### 2. Check WWW Subdomain

**Should have:**
```
Type: CNAME
Name: www
Target: hogtechgh.com (or cname.vercel-dns.com)
Proxy: Proxied ✅
```

**Check for:**
- Multiple CNAME records for `www` → Delete duplicates
- Both A and CNAME for `www` → Remove A, keep CNAME

---

### 3. Check R2 Files Subdomain (`files.hogtechgh.com`)

**Should have:**
```
Type: CNAME
Name: files
Target: [bucket-name].[account-id].r2.cloudflarestorage.com
Proxy: DNS only (gray cloud) ⚠️ OR Proxied
```

**Check for:**
- Multiple CNAME records for `files` → Delete duplicates
- Both A and CNAME for `files` → Remove A, keep CNAME
- Wrong target → Should point to R2 bucket, not something else

---

### 4. Check for Other CNAME Records

Look for any other CNAME records that might conflict:
- `mail.hogtechgh.com`
- `mail.hogtechgh.com`
- `api.hogtechgh.com`
- Any other subdomains

---

## 🎯 Most Likely Issues

### Issue #1: Root Domain Has CNAME (Most Common)
**Symptom:** `hogtechgh.com` or `@` shows as CNAME type
**Fix:** Delete CNAME, add A record instead

### Issue #2: R2 Custom Domain Not Properly Configured
**Symptom:** `files.hogtechgh.com` CNAME points to wrong target or conflicts
**Fix:** Ensure CNAME points to correct R2 bucket URL

### Issue #3: Multiple CNAME Records for Same Name
**Symptom:** Same subdomain has 2+ CNAME records
**Fix:** Delete duplicates, keep only one

---

## 📋 Complete DNS Records You Should Have

```
✅ CORRECT SETUP:

@ (root)                → A record      → [Vercel IP or Cloudflare proxy]
www                     → CNAME         → hogtechgh.com (or Vercel CNAME)
files                   → CNAME         → [r2-bucket].r2.cloudflarestorage.com
ftp                     → CNAME         → hogtechgh.com (you already have this ✅)
```

---

## 🔧 Quick Fix Steps

1. **Go to Cloudflare Dashboard:**
   - https://dash.cloudflare.com
   - Select `hogtechgh.com`
   - Go to **DNS** → **Records**

2. **Check root domain:**
   - Look for `@` or `hogtechgh.com` record
   - **If it's CNAME:** Delete it, add A record
   - **If it's A:** That's correct ✅

3. **Check `files` subdomain:**
   - Look for `files` CNAME record
   - Ensure it points to R2 bucket
   - Remove any duplicates

4. **Clear cache:**
   - Go to **Caching** → **Purge Everything**
   - Wait 5-10 minutes

5. **Test:**
   - Try verification link again
   - Should work without Error 1014

---

## ❓ What to Tell Me

Please check and tell me:

1. **What type is the root domain (`@` or `hogtechgh.com`)?**
   - A record? ✅
   - CNAME? ❌ (This is the problem!)

2. **What does `files.hogtechgh.com` show?**
   - CNAME to R2 bucket? ✅
   - Something else? ❌

3. **Are there any duplicate CNAME records?**
   - Multiple `www` records?
   - Multiple `files` records?

Once I know these, I can tell you exactly what to fix!

