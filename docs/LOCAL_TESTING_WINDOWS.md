# Local testing on Windows (Command Prompt)

This guide runs the whole platform on a Windows 10/11 PC and walks through testing **recurring
donations**, **payout import** and **browser push notifications**. No real money, payment account
or LiveKit account is needed: payments use the built-in **payment simulator**.

All commands are for **Command Prompt (`cmd.exe`)**. Lines starting with `REM` are comments.

---

## Part 1 — One-time setup

### 1.1 Install the tools
Open **Command Prompt** and install with `winget` (built into Windows 10/11):

```bat
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
winget install -e --id PostgreSQL.PostgreSQL.16
```

- During the PostgreSQL installer, **remember the password you set for the `postgres` user** and
  keep the default port **5432**.
- **Close and reopen Command Prompt** so the new programs are on your `PATH`.

Check the versions (Node must be **22.9 or newer**):

```bat
node -v
npm -v
git --version
```

Add PostgreSQL's tools to `PATH` for this window (adjust `16` if you installed another version):

```bat
set PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin
psql --version
```

### 1.2 Create the database user and databases
```bat
psql -U postgres -h localhost -c "CREATE USER prayer WITH PASSWORD 'prayer' CREATEDB;"
psql -U postgres -h localhost -c "CREATE DATABASE prayer_dev OWNER prayer;"
psql -U postgres -h localhost -c "CREATE DATABASE prayer_test OWNER prayer;"
psql -U postgres -h localhost -c "CREATE DATABASE prayer_e2e OWNER prayer;"
```
Enter the `postgres` password when asked. (`prayer_test` and `prayer_e2e` are only used by the
automated tests, which refuse to touch any database without `test`/`e2e` in its name.)

### 1.3 Get the code
```bat
cd %USERPROFILE%
git clone https://github.com/schoolumio/she_builders.git
cd she_builders
git checkout claude/amazing-dirac-4sq9x8
npm install
```

### 1.4 Configure `.env`
```bat
copy .env.example .env
```

Generate two secrets (run each line and copy the output):

```bat
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Open the file with `notepad .env` and set at least these lines (use your generated values):

```ini
APP_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://prayer:prayer@localhost:5432/prayer_dev?schema=public
APP_ENCRYPTION_KEY=<first value, the base64 one>
CRON_SECRET=<second value, the hex one>
EMAIL_DRIVER=log
STORAGE_DRIVER=local
PAYMENTS_SIMULATOR_ENABLED=true
PAYMENTS_SIMULATOR_SECRET=any-long-random-text
BILLING_PROVIDER=none
```
Save and close Notepad.

### 1.5 Create the tables and sample data
```bat
npx prisma migrate deploy
npm run db:seed
```
The seed prints sample logins. Every sample account uses the password **`SamplePass123!`**:

| Email | Role in "Sample Prayer Circle (demo data)" |
| --- | --- |
| `owner@sample.test` | Owner |
| `finance@sample.test` | Finance administrator |
| `coordinator@sample.test` | Prayer coordinator |
| `host@sample.test` | Meeting host |
| `member@sample.test` | Member |

### 1.6 Start the app
```bat
npm run dev
```
Open **http://localhost:3000** in Chrome or Edge. Leave this window running; open a **second
Command Prompt** (`cd %USERPROFILE%\she_builders`) for any other commands.

> **Tip:** to be signed in as two people at once, use a normal window for one account and an
> **InPrivate/Incognito** window (Ctrl+Shift+N) for the other.

> **Emails** (receipts, verification links, notices) are not sent while `EMAIL_DRIVER=log`; they
> are printed in the `npm run dev` window between `=== EMAIL to …` lines.

---

## Part 2 — Prepare fundraising (once)

1. Sign in as **`finance@sample.test`**.
2. Go to **Sample Prayer Circle → Finance → Payment account**.
3. If fundraising is off, click **Turn fundraising on**.
4. On the **Payment simulator (test only)** card click **Connect with Payment simulator**.
5. On the striped simulator page click **Approve (verified)**. You return to the setup page, which
   should say **"Yes — donations can be accepted"** with status **Verified**.
6. Go to **Finance → Campaigns → New campaign**:
   - Title: `Monthly partners`, Description: `Partner with us monthly.`
   - Currency `NGN`, keep the suggested amounts.
   - Tick **Offer weekly and monthly recurring gifts**.
   - Click **Save draft**, then **Approve & publish**.
7. The green box shows the public giving link, e.g.
   `http://localhost:3000/c/sample-prayer-circle/give/<campaign-id>`. Copy it.

---

## Part 3 — Test recurring donations

### 3.1 Start a monthly gift
1. In an **InPrivate** window sign in as **`member@sample.test`** and open the giving link.
2. Choose an amount, select **Monthly** under *How often?*, click **Review donation**.
3. Check the review page: recipient, amount **per month**, fees, and that you can cancel at any time.
   Click **Continue to secure payment**.
4. On the simulator page click **Start subscription (first payment succeeds)**.
5. You return to the gift page: status **Active**, one entry under **Payments**, and an estimated
   next payment date. A receipt email appears in the `npm run dev` window.

> Signed-out visitors don't see the *How often?* choice — recurring gifts require an account so the
> donor can always cancel. Try opening the giving link signed out to confirm.

### 3.2 Simulate later months
Open **http://localhost:3000/simulator** (the provider control panel). Under *Recurring gifts* use:

| Button | What to check afterwards |
| --- | --- |
| **Charge next period** | **My giving** (member) shows *2 payments made*; **Finance → Donations** shows a second confirmed donation with its own receipt. |
| **Charge fails** | Gift shows **payment failed**; the member gets a notification (bell icon) and an email. Click **Charge next period** again → back to **Active**. |
| **Cancel at provider** | Gift shows **Cancelled** "by the payment provider". |

### 3.3 Cancel as the donor
Start another monthly gift (3.1), then go to the member's **My giving** page and click **Cancel**
→ confirm. The gift shows *canceled* and the simulator panel shows the subscription as `canceled`.

### 3.4 Finance view
As `finance@sample.test` open **Finance → Recurring gifts**: active gifts, an approximate monthly
total, payment counts, and a **Cancel** button for each active gift.

---

## Part 4 — Test payout import

1. Make sure there is at least one confirmed donation (Part 3 or a one-time gift).
2. Open **http://localhost:3000/simulator** → *Payouts* → for **Sample Prayer Circle** click
   **Create payout (paid)**, then **Create payout (in transit)** (the second one is only created if
   there is still money not yet paid out — make another donation first if nothing appears).
3. As `finance@sample.test` open **Finance → Payouts** → it says *No payouts imported yet* →
   click **Import from Payment simulator**. Expect *"Imported from the provider: N new, 0 updated"*
   and rows with status **paid** / **pending**.
4. Click **Import** again → *"0 new, 0 updated"* (imports never duplicate).
5. In the simulator panel click **Mark paid (webhook)** on the in-transit payout, then refresh
   **Finance → Payouts**: it is now **paid** without importing (the signed webhook updated it).
6. **Finance → Overview** shows **Paid out to your bank** and **Payouts in transit**.
7. Automatic import runs from the scheduler. Trigger it manually from the second window:
   ```bat
   npm run cron:tick
   ```
   It prints a JSON summary including `payoutsImported` (each account is refreshed at most every
   6 hours).

---

## Part 5 — Test browser push notifications

### 5.1 Create push keys (once)
```bat
npx web-push generate-vapid-keys
```
Copy the two keys into `.env` (Notepad):
```ini
VAPID_PUBLIC_KEY=<Public Key>
VAPID_PRIVATE_KEY=<Private Key>
VAPID_SUBJECT=mailto:you@example.com
```
Stop the dev server (**Ctrl+C**, then `Y`) and start it again with `npm run dev`.

### 5.2 Allow notifications in Windows
**Settings → System → Notifications**: notifications **On**, and **On** for Google Chrome /
Microsoft Edge. Turn off **Do not disturb / Focus**.

### 5.3 Turn on push for a user
1. Use **Chrome or Edge** at exactly **http://localhost:3000** (push needs `localhost` or HTTPS).
2. Sign in as `owner@sample.test` → avatar menu → **Profile & settings**.
3. Under *Browser notifications on this device* click **Turn on browser notifications** → **Allow**.
4. Click **Send a test notification** → a Windows notification appears. Clicking it opens
   *Notifications* in the app.

### 5.4 Receive a real notification
1. Still as the owner: **Administration → Announcements & prayer points** → write an announcement,
   tick **Publish now and notify members**, **Save**. A push notification arrives.
2. Per-category control: on **Profile & settings** untick the **Browser** box for *Announcements*,
   **Save preferences**, publish another announcement → no push (it still appears in the bell list).
3. **Turn off on this device** removes the subscription.

Optional: enable push for `member@sample.test` in a separate Chrome profile (not InPrivate — many
browsers block push in private windows) and repeat 5.4 from the owner account.

---

## Part 6 — Run the automated tests

In the second Command Prompt:

```bat
cd %USERPROFILE%\she_builders
npm run typecheck
npm run lint
npm test
```
`npm test` runs ~140 unit and integration tests against `prayer_test` (expect all passing).

End-to-end browser tests (build first; they start their own server on port **3100** using
`prayer_e2e`):

```bat
npx playwright install chromium
npm run build
npm run test:e2e
```
Expect ~18 tests passing, including `recurring-payouts.spec.ts` (recurring gifts + payout import),
the full acceptance workflow and the accessibility scans. Push notifications are covered by
integration tests with a fake push service; the real browser flow is the manual Part 5.

To run one file: `npx playwright test e2e/recurring-payouts.spec.ts`
To watch it in a visible browser: `npx playwright test e2e/recurring-payouts.spec.ts --headed`

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `'psql' is not recognized` | Run `set PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin` in that window. |
| `password authentication failed for user "prayer"` | Re-run step 1.2, or check `DATABASE_URL` in `.env`. |
| `Can't reach database server at localhost:5432` | Start the service: `net start postgresql-x64-16` (Command Prompt **as administrator**). |
| `FREE plan missing — run the database seed` | `npm run db:seed` |
| Port 3000 already in use | `npx next dev -p 3001` and set `APP_URL=http://localhost:3001` in `.env`. |
| `/simulator` shows *page not found* | `PAYMENTS_SIMULATOR_ENABLED=true` and `APP_ENV=development` in `.env`, then restart. |
| *How often?* doesn't appear on the give page | Sign in; tick *Offer weekly and monthly recurring gifts* on the campaign; the payment account must be **Verified** (the simulator or Stripe — Paystack does not offer recurring yet). |
| "Browser notifications are not configured" | The three `VAPID_*` values are missing; restart `npm run dev` after editing `.env`. |
| Test notification says nothing was delivered | Allow notifications for the site (padlock icon → Site settings), check Windows notification settings and Focus, then turn push off and on again. |
| `npm run cron:tick` returns 401 | `CRON_SECRET` in `.env` must be set, and the dev server must be running. |
| E2E: *Could not find a production build* | Run `npm run build` before `npm run test:e2e`. |
| Start again with fresh data | `psql -U postgres -h localhost -c "DROP DATABASE prayer_dev;"`, recreate it (step 1.2), then `npx prisma migrate deploy` and `npm run db:seed`. **This deletes all local data.** |
