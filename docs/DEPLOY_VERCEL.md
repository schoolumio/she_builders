# Deploying a shareable demo on Vercel (Windows guide)

This guide puts the platform online at a link like `https://altarcall-demo.vercel.app` so a client can
try it. It uses two hosted services with free tiers:

- **Neon**: hosted PostgreSQL database.
- **Vercel**: runs the Next.js app.

Allow about 30–45 minutes. Commands are for **Windows Command Prompt (cmd)**, run inside your local
copy of the project (the folder that contains `package.json`).

> This is a **demo/staging** setup (`APP_ENV=staging`). It uses the payment simulator (no real money)
> and prints emails to the server logs. For a real launch, follow [DEPLOYMENT.md](DEPLOYMENT.md) and
> [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).
>
> Vercel's free **Hobby** plan is for non-commercial use. If the demo is part of a paid engagement,
> check Vercel's current terms; the **Pro** plan may be required.

---

## 1. Put the code on GitHub

The code is already in the GitHub repository on the branch `claude/amazing-dirac-4sq9x8`. Vercel
deploys a project's **production branch** (usually `main`). Pick one:

- **Option A (recommended):** merge the branch into `main` on GitHub (open a pull request and merge it).
- **Option B:** keep the branch and tell Vercel to use it (step 4.6).

## 2. Create the database (Neon)

1. Go to <https://neon.tech> and sign up (GitHub login is fine).
2. **Create project** → name it `altarcall-demo` → choose the region closest to your users
   (e.g. *AWS Europe (Frankfurt)* for Nigeria/UK, *US East* for the Americas) → Postgres 16 or newer.
3. On the project dashboard click **Connect**. You need **two** connection strings:
   - **Pooled** (the *Connection pooling* toggle **on**; the host contains `-pooler`). Vercel uses this one.
   - **Direct** (toggle **off**). You use this one from your PC for migrations and sample data.

   Both look like:
   `postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. Add `&pgbouncer=true` to the end of the **pooled** string. Prisma needs this flag behind a pooler.

## 3. Create the tables and sample data (from your PC)

In cmd, in the project folder:

```bat
git pull
npm install

rem Use the DIRECT Neon string here (no -pooler). Keep the quotes; they stop cmd breaking on "&".
set "DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require"

npx prisma migrate deploy
npm run db:seed
```

You should see `All migrations have been successfully applied`, then `✓ Plans seeded` and
`✓ Sample organisation created`.

`set` only lasts for this cmd window. Your local `.env` file is **not** changed, and your
local database is not touched.

> The seed creates a clearly-labelled **sample** community ("Sample Prayer Circle (demo data)") with
> five logins, all using the password `SamplePass123!`:
> `owner@sample.test`, `coordinator@sample.test`, `finance@sample.test`, `host@sample.test`,
> `member@sample.test`. Skip `npm run db:seed` if you don't want sample data.

Generate two secrets now (run each line, copy the output somewhere safe):

```bat
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Use the first for `APP_ENCRYPTION_KEY`, the second for `CRON_SECRET` and the third for
`PAYMENTS_SIMULATOR_SECRET`.

## 4. Create the Vercel project

1. Go to <https://vercel.com> → sign up with GitHub.
2. **Add New… → Project** → find the repository → **Import**. If it isn't listed, click
   *Adjust GitHub App Permissions* and give Vercel access to it.
3. **Project Name**: e.g. `altarcall-demo`. Your link will be `https://altarcall-demo.vercel.app`.
   Framework preset: **Next.js**. Leave the build and output settings at their defaults; the
   `build` script already runs `prisma generate`.
4. Open **Environment Variables** and add these:

   | Name | Value |
   | --- | --- |
   | `APP_ENV` | `staging` |
   | `APP_URL` | `https://altarcall-demo.vercel.app` (your project name, no trailing slash) |
   | `DATABASE_URL` | the **pooled** Neon string ending in `&pgbouncer=true` |
   | `APP_ENCRYPTION_KEY` | first secret from step 3 |
   | `CRON_SECRET` | second secret |
   | `STORAGE_DRIVER` | `database` (stores uploaded logos and cover images in Postgres) |
   | `EMAIL_DRIVER` | `log` (emails appear in Vercel logs). See step 7 for real email. |
   | `EMAIL_FROM` | `AltarCall <no-reply@example.com>` |
   | `PAYMENTS_SIMULATOR_ENABLED` | `true` |
   | `PAYMENTS_SIMULATOR_SECRET` | third secret |
   | `BILLING_PROVIDER` | `none` |

5. Click **Deploy**. The first build takes a few minutes.
6. **Option B only:** Project → **Settings → Git → Production Branch** → enter
   `claude/amazing-dirac-4sq9x8` → save. Then **Deployments** → latest → **⋯ → Redeploy**.
7. If Vercel gave the project a different address than you expected (see **Settings → Domains**),
   update `APP_URL` to match it and redeploy. Login cookies, emails and payment callbacks all
   depend on `APP_URL`.

## 5. Generate the meeting calendar

Meeting dates are created by a scheduled job (`/api/cron/tick`). `vercel.json` runs it once a day,
the most often the free plan allows. Run it once yourself now so the sample meetings appear.
Windows 10 and 11 include `curl`:

```bat
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://altarcall-demo.vercel.app/api/cron/tick
```

The reply looks like `{"occurrencesCreated":65,...}`.

**Reminders and timely jobs:** meeting reminders, retrying failed emails and similar work need the job
every 5 minutes. On Vercel Pro, change the schedule in `vercel.json` to `*/5 * * * *`. On the free
plan, use a free external scheduler instead. For example, with <https://cron-job.org>:
create a job → URL `https://altarcall-demo.vercel.app/api/cron/tick` → every 5 minutes →
**Advanced** → request method `POST` → header `Authorization` = `Bearer YOUR_CRON_SECRET`.

## 6. Check it works and share it

1. Open `https://altarcall-demo.vercel.app`. You should see the AltarCall home page.
2. **Log in** as `member@sample.test` / `SamplePass123!` → open the sample community → **Groups** →
   *Morning Intercessors (sample)* → **Open group**. You should see group meetings, an announcement
   and a prayer request.
3. Log in as `owner@sample.test` to show the admin side (members, meetings, content, giving).
4. To demo giving, use **Give** in the sample community. The simulator acts as the payment
   provider; no real money moves.
5. Share the link with your client. Give them the sample logins, or let them **Register** their own
   account (see the note on email below).

### Make yourself a platform administrator (optional)

Register on the live site with your own email. With `EMAIL_DRIVER=log` the verification email is
not sent; open Vercel → your project → **Logs**, find the line containing the verification link and
open it. Then, from cmd, with the **direct** Neon string:

```bat
set "DATABASE_URL=postgresql://...direct string..."
npm run admin:create -- you@yourdomain.com
```

## 7. Optional upgrades

- **Real email** (registration, invitations, reminders): create a free account at
  <https://resend.com>, verify a domain, then set `EMAIL_DRIVER=resend`, `RESEND_API_KEY=…` and
  `EMAIL_FROM=AltarCall <no-reply@yourdomain.com>` → redeploy.
- **In-app audio/video meetings**: create a free project at <https://cloud.livekit.io> → Settings →
  Keys. Set `LIVEKIT_URL` (the `wss://…` URL), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` →
  redeploy. Without these, WhatsApp meetings still work, and audio/video meetings show that
  live rooms aren't configured.
- **Browser notifications**: run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@yourdomain.com` → redeploy.
- **Own domain** (e.g. `demo.altarcall.com`): Vercel → Settings → Domains → add it and follow the
  DNS instructions. Then set `APP_URL` to the new address and redeploy.

## Updating the demo later

- Push to the production branch, and Vercel redeploys automatically.
- If the update includes new database migrations (new folders under `prisma/migrations`), run
  `npx prisma migrate deploy` from cmd with the **direct** string, as in step 3, **before** or right
  after the deploy finishes.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails with `Environment variable not found: DATABASE_URL` | Add `DATABASE_URL` in Vercel → Settings → Environment Variables (all environments), then redeploy. |
| Pages error with `prepared statement "s0" already exists` | The pooled string is missing `&pgbouncer=true`. |
| `The table ... does not exist` | Step 3 (`npx prisma migrate deploy`) wasn't run against this Neon database. |
| Email links or payment "return to site" go to the wrong address | Fix `APP_URL` (check `https://` and spelling, no trailing slash), then redeploy. Always share the main `….vercel.app` address, not a preview-deployment URL. |
| No meetings on the calendar | Run the `curl` command in step 5. |
| Uploading a logo fails with a storage error | Set `STORAGE_DRIVER=database` and redeploy. |
| `curl` returns `Unauthorized` | The bearer value must exactly match `CRON_SECRET` in Vercel. |

## Other hosts

The app also runs anywhere that runs Node.js 20+ and PostgreSQL, for example **Render** or
**Railway**. Both can run a 5-minute cron and keep a normal server running. Use the same
environment variables, build command `npm run build`, start command `npm start`, and run
`npx prisma migrate deploy` before the first start. See [DEPLOYMENT.md](DEPLOYMENT.md) for the
Docker image.
