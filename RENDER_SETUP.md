# Stillwatch: existing Render Static Site setup

Keep the existing site at https://larphacksproject.onrender.com and its GitHub auto-deploy connection. Deploy the branch containing the Supabase migration.

## Render settings

- **Service type:** Static Site (keep this)
- **Build command:** `python3 scripts/build_static.py`
- **Publish directory:** `dist`
- **Root directory:** repository root (leave blank)

Add these environment variables, then save and redeploy:

```text
SUPABASE_URL=https://rkzwufzosvuonroiwnwx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ELw6UHMFJ8M9YAvgZBobGw_6nxlEKE5
```

These are intentionally public browser connection values. Do not use the Supabase database password, secret key, or service-role key. There is no Flask/Gunicorn start command, database disk, or paid web service.

Do not publish `.`: `dist` contains only frontend assets. Remove any catch-all rewrite that overrides existing files. Optional redirects: `/login` → `/login.html`, `/signup` → `/signup.html`.

## Supabase project

Project: **Stillwatch** (`rkzwufzosvuonroiwnwx`)

- Site URL: `https://larphacksproject.onrender.com`
- Allowed redirects: `https://larphacksproject.onrender.com/login.html` and `http://localhost:8000/login.html`
- Also allow password recovery redirects: `https://larphacksproject.onrender.com/reset-password.html` and `http://localhost:8000/reset-password.html`. Keep the recovery email link as `{{ .ConfirmationURL }}`.
- Email/password authentication is used. Keep email confirmation enabled.
- Configure custom SMTP in Supabase before accepting public signups. The built-in sender is intended for testing with authorized team addresses. SMTP credentials belong only in Supabase, never the frontend or GitHub.

## Verify after deployment

1. Open `/auth-config.json` and confirm it contains the two public connection values.
2. Visit `/signup.html`, create an account with an email you control, and open the confirmation link in the same browser (PKCE).
3. Log in, confirm the current Stillwatch UI appears, then log out.
4. Refresh `/` while logged out: it should return you to login.
5. Choose **Forgot password?**, request a reset email, and open it in the same browser. Set a new password, then confirm the new password logs in and the old one fails. Also verify an expired link offers a new reset request.

Existing local SQLite accounts are not migrated. Users create new Supabase accounts. Camera frames and session movement metrics still remain on the device.
