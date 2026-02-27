# Email Alerts & Marketing Studio

An internal-ready email app for:

- Drag-and-drop email design (GrapesJS)
- Modern pre-seeded templates
- Contact import from CSV/XLSX
- Contact grouping for targeted sends
- Campaign creation and send history
- Resend integration with per-recipient delivery status
- Attachments and images from file upload or URL

## Stack

- Next.js (App Router, TypeScript)
- Prisma + SQLite
- Resend API
- GrapesJS email editor
- PapaParse + XLSX file ingestion

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment values in `.env`:

```env
DATABASE_URL="file:./dev.db"
RESEND_API_KEY="re_xxxxx"
RESEND_FROM_EMAIL="updates@yourdomain.com"
NEXTAUTH_URL="http://localhost:3200"
AUTH_SECRET="replace-with-random-secret"
AUTH_AZURE_AD_ID="your-app-client-id"
AUTH_AZURE_AD_SECRET="your-app-client-secret"
AUTH_AZURE_AD_TENANT_ID="your-tenant-id"
CONTACT_DATA_ENCRYPTION_KEY="base64-encoded-32-byte-key"
CONTACT_DATA_HASH_PEPPER="long-random-pepper-string"
LOCAL_ADMIN_USERNAME="local-admin"
LOCAL_ADMIN_PASSWORD="change-me-strong-password"
```

3. Create DB and Prisma client:

```bash
npx prisma migrate dev --name init
```

4. Start app:

```bash
npm run dev
```

Open `http://localhost:3200`.

For Microsoft Entra app registration, add this redirect URI:

- `http://localhost:3200/api/auth/callback/azure-ad`

## Access Control

- Entra login is allowlist-based: the incoming Entra username must match an enabled `AppUser.username`.
- If no match exists, sign-in is denied with "No matching user account found".
- Admins can manage allowed users and roles at `/admin`.
- `/admin` is hidden from non-admin users and blocked server-side for non-admin roles.
- Local fallback login is available at `/api/auth/signin/credentials` using `LOCAL_ADMIN_USERNAME` and `LOCAL_ADMIN_PASSWORD`.
- Recommended bootstrap flow:
	1. Sign in once with local fallback admin.
	2. Open `/admin` and add Entra users/roles.
	3. Keep fallback local admin credentials only for break-glass use.

## Workflow

1. **Contacts tab**: import CSV/XLSX and create groups.
2. **Templates tab**: open preloaded templates or create/edit with drag-drop builder.
3. **Campaigns tab**: choose group + template, add attachments (file or URL), save campaign.
4. Click **Send now** to dispatch through Resend and log success/failure for each contact.

## Notes

- The app auto-creates default modern templates the first time templates are loaded.
- `{{name}}` in campaign HTML is replaced with each contact name at send time.
- Uploaded assets are stored in `public/uploads`.

## Security before deployment

- Rotate API keys before production deployment.
- Never commit `.env` or local SQLite files (`dev.db`, `prisma/dev.db`).
- Use Microsoft Entra ID for all UI/API access (Auth.js + middleware route protection).
- Encrypt contact PII at rest (`email`, `name`, `company`, `tagsCsv`) with `CONTACT_DATA_ENCRYPTION_KEY`.
- Contact uniqueness is enforced by salted `emailHash` values (`CONTACT_DATA_HASH_PEPPER`) instead of plaintext email.
- `.dockerignore` excludes secrets, local DB, build cache, and uploads from image layers.
- Use Docker volumes for data persistence (`/app/data` and `/app/public/uploads`) instead of baking data into images.

### Generate encryption values

PowerShell examples:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
```

Use the first output for `CONTACT_DATA_ENCRYPTION_KEY` and the second for `CONTACT_DATA_HASH_PEPPER`.

### One-time rekey for existing data

After enabling the new encryption keys, run this once while signed in:

- `POST /api/contacts/rekey`

This rewrites legacy plaintext contact fields and existing campaign recipient emails into encrypted form.

## Docker and secret safety

- Build using `Dockerfile` without any `ARG` for secrets.
- Provide `RESEND_API_KEY` only at runtime (Portainer environment variables or Docker secrets), never during `docker build`.
- Use `docker-compose.portainer.yml` and set env vars in Portainer UI instead of committing `.env`.
- Optional verification after build:

```bash
docker image history your-dockerhub-user/email-app:latest --no-trunc
docker run --rm your-dockerhub-user/email-app:latest sh -lc 'env | grep -E "RESEND_API_KEY|AUTH_AZURE_AD_SECRET|CONTACT_DATA_ENCRYPTION_KEY|CONTACT_DATA_HASH_PEPPER" || true'
```

These checks should not reveal your secret values unless you inject them at runtime.

## Data persistence in Portainer

- Contacts, groups, templates, campaigns, and recipient history are stored in SQLite at `/app/data/dev.db`.
- Uploads are stored in `/app/public/uploads`.
- `docker-compose.portainer.yml` mounts both as named volumes:
	- `email_app_data` -> `/app/data`
	- `email_app_uploads` -> `/app/public/uploads`

### Safe update workflow (no data wipe)

1. Push a new image tag (for example `:v2`).
2. In Portainer, edit the stack and only change the image tag.
3. Keep the same stack name and keep the same volume names.
4. Redeploy the stack without removing volumes.

As long as the named volumes are preserved, user data survives container/image updates.
