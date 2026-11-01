# Stillwatch: one Render service for the website and sport API

The target public URL is https://larphacksproject.onrender.com for both the website and sport generation. Deploy `main` using the repository's `app.py` entrypoint.

## Render settings

- **Service type:** Web Service
- **Runtime:** Python 3
- **Build command:** `pip install -r requirements.txt && python3 scripts/build_static.py`
- **Start command:** `bash start.sh`
- **Health check:** `/health`
- **Root directory:** repository root (leave blank)

Add these environment variables, then save and redeploy:

```text
SUPABASE_URL=https://rkzwufzosvuonroiwnwx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ELw6UHMFJ8M9YAvgZBobGw_6nxlEKE5
PYTHON_VERSION=3.12.7
```

The Supabase values are intentionally public browser configuration. Also set `SPORTGEN_API_KEY` and `SPORTGEN_FAST_API_KEY` to your NVIDIA keys on this same service; these remain private. Do not use a Supabase secret or service-role key.

`app.py` serves only the allowlisted `dist` directory and registers the API routes before the static files. No separate API hostname or `SPORTGEN_API_URL` is needed.

`render.yaml` describes this Python service. Committing it does not automatically convert an existing manually configured Static Site or reassign its Render URL. If the current service is a Static Site, migrate it to a Web Service through Render and confirm the target URL is assigned to that service. Preserve the existing site's configuration until the replacement works. A static-only deployment can display the website but cannot execute `/jobs`.

## Supabase project

Project: **Stillwatch** (`rkzwufzosvuonroiwnwx`)

- Site URL: `https://larphacksproject.onrender.com`
- Allowed redirects: `https://larphacksproject.onrender.com/login.html` and `http://localhost:8000/login.html`
- Also allow password recovery redirects: `https://larphacksproject.onrender.com/reset-password.html` and `http://localhost:8000/reset-password.html`. Keep the recovery email link as `{{ .ConfirmationURL }}`.
- Email/password authentication is used. Keep email confirmation enabled.
- Configure custom SMTP in Supabase before accepting public signups. The built-in sender is intended for testing with authorized team addresses. SMTP credentials belong only in Supabase, never the frontend or GitHub.

## Verify after deployment

1. Open `/auth-config.json` and confirm it contains the two public connection values.
   Open `/health` and `/triggers` and confirm both return JSON from the same domain.
2. Visit `/signup.html`, create an account with an email you control, and open the confirmation link in the same browser (PKCE).
3. Log in, confirm the current Stillwatch UI appears, then log out.
4. Refresh `/` while logged out: it should return you to login.
5. Choose **Forgot password?**, request a reset email, and open it in the same browser. Set a new password, then confirm the new password logs in and the old one fails. Also verify an expired link offers a new reset request.
6. Choose **Invent a sport**. Confirm the browser posts to `https://larphacksproject.onrender.com/jobs`, then polls `/jobs/{id}` until the rule card appears.

Existing local SQLite accounts are not migrated. Users create new Supabase accounts. Camera frames and session movement metrics still remain on the device.
