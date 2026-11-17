# HD Freezer Balance Portal — GitHub Pages + Supabase

This is a **cloud-backed production starter** (not the old local simulation). It includes real Supabase email/password login, SQL row-level security, admin-only master imports, atomic HD balance reservation, admin-only FIFO allocation, a cloud allocation audit trail, 20-row paginated negative balances and admin requests, Excel templates, and light/dark mode. **It is not yet a fully audited enterprise production release**; complete the verification checklist before using real financial/asset data.

## What GitHub does (and does not do)

GitHub Pages hosts `index.html`, `styles.css`, `app.js` and `config.js`. **It is not a database, authentication provider, or mail server.** Supabase provides Auth and Postgres. All permissions and FIFO allocation are checked in Postgres, not just hidden in the UI. Approval generates an HTML email draft for the SDM/CFA; it **does not send email**. Email delivery requires a server-side provider integration (e.g. Supabase Edge Functions + Resend) with secrets stored server-side.

## Step-by-step deployment

1. **Supabase**: Create a project at https://supabase.com/dashboard and save the **Project URL** and **publishable/anon key** from **Project Settings → API Keys**. Never use the `service_role` or secret key in frontend files.
2. **Database**: Open **SQL Editor** in Supabase. Paste the entire contents of `supabase/schema.sql`, then **Run**. This creates tables, policies, secure functions and the balance view. Do this on a new empty project. Save the SQL for version control.
3. **Users**: In Supabase **Authentication → Users**, use **Add user** or **Invite user** to create the initial Admin and Sales Team accounts. Disable public signups in **Authentication → Providers → Email** if you want invitation-only accounts. Ensure users have confirmed emails / valid passwords.
4. **Grant the first Admin**: In SQL Editor run the following after replacing the email:

   ```sql
   update public.profiles set role='admin', active=true
   where user_id=(select id from auth.users where email='admin@yourcompany.com');
   ```

   New users default to `sales`. **Only a Supabase project owner** should promote Admin accounts in the SQL Editor. Do not expose any Admin role editor to ordinary users.
5. **Configure frontend**: Edit `config.js` and replace `YOUR-PROJECT` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with your real Supabase Project URL and publishable/anon key. These are public client credentials; access is controlled by RLS. Never put passwords or secret keys in the repository. For a public repo, consider using GitHub Actions variables for the public config file, or add it via GitHub's editor (this starter includes a placeholder `config.js` for direct upload).
6. **GitHub repository**: Sign in at https://github.com, click **New repository**, name it e.g. `hd-freezer-portal`, and choose **Public** for standard GitHub Pages. Click **Add file → Upload files**, upload the contents of this ZIP (including `index.html`, `app.js`, `styles.css`, `config.js`, and `templates/`), and commit. For folders, use GitHub Desktop or git CLI if the web upload interface doesn't preserve folder structure.
7. **GitHub Pages**: In repository **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: main**, **Folder: /(root)** and Save. Wait for deployment. Your URL will normally be `https://YOUR-USERNAME.github.io/hd-freezer-portal/`. Visit the exact URL displayed under Settings → Pages.
8. **Admin upload**: Sign in as Admin, upload the 4 masters in this order: `HD Details`, `HD-wise CFA & Sales Team`, `HD Asset Details`, `CFA In-Hand Stock`. Templates are in `templates/`. The upload **replaces** the selected master, not appends. For data safety, replacement of HD/Asset masters is blocked once requests exist, and Stock master replacement is blocked after any allocation exists.
9. **Sales Team**: Sign in with a Sales account, search an HD, view available balance and assigned CFA stock by capacity, add cooler requests, and submit. Each successful submission is **atomically reserved in the cloud** and reduces the HD available balance for all users. If insufficient balance, the database rejects the request.
10. **Admin approval**: Sign in as Admin, open Admin Approvals, Approve/Reject. Approval atomically allocates matching CFA stock FIFO by receipt date, persists asset tags and timestamps in Supabase, and downloads a draft HTML email for the SDM/CFA. Rejection releases the reserved amount. Export all allocations using **Download Allocation History CSV**.

## Excel master headers

- `01_HD_Details_Template.xlsx`: HD Code, HD Name, Location, CFA Code, Total Deposit, Security Deposit, SDM Name, RSM Name, ZSM Name, DD Date, DD Number, DD Value, Block
- `02_HD_Wise_CFA_Sales_Master_Template.xlsx`: HD Code, CFA Code, CFA Name, CFA Location, Requester Email, CFA Email, SDM Name, SDM Email, RSM Name, RSM Email, ZSM Name, ZSM Email
- `03_HD_Asset_Details_Template.xlsx`: HD Code, Asset Tag Number, Cooler Capacity, Asset Value
- `04_CFA_In_Hand_Stock_Template.xlsx`: Asset Tag Number, Cooler Capacity, Asset Value, Stock Receipt Date, CFA Code, CFA Name, CFA Location, Stock Status, Allocation Status (**no Vendor Code**)
- `05_Allocation_History_Export_Template.xlsx`: reference format for the downloadable allocation history; actual exported data comes from Supabase.

## Security and operational limitations

- **No passwords or secret keys in GitHub**. Only Supabase publishable/anon key belongs in `config.js`.
- Role and data permissions are enforced in Supabase. Sales Team cannot edit master data, see contact email records or raw asset/stock tag rows, approve requests, or view all allocations. Sales can see aggregate balances and CFA stock counts.
- Master import is one atomic RPC per sheet, maximum **15,000 rows**. Large uploads may exceed your Supabase project's request limits despite this row cap. For large-scale use, implement a backend upload job/staging tables.
- Master imports require valid, unique HD Codes/asset tags. Dates should be real Excel dates or `DD-MM-YYYY`/`YYYY-MM-DD`. Check capacities against the 11 approved request options.
- An approved request reserves balance; the allocation does not also reduce balance a second time. If your asset master later includes the newly allocated tags, reconcile the request reservation during your accounting process to avoid double counting.
- Negative HD Alerts use **original balance** to identify HDs already negative; the displayed amount is the **current available balance**, including requests. You can change the query to use `available_balance < 0` if that is your reporting definition.
- Browser UI pagination: 20 negative HDs and 20 pending admin requests per page.
- Frontend uses CDN libraries (Supabase JS and SheetJS), requiring internet. Pin/self-host audited dependencies before critical deployment.
- This starter does **not** include automated email sending, document attachments storage, automatic backup scheduling, multi-tenant partitioning, audit logs for master imports, or a CI test suite. Supabase project database backups and recovery settings should be configured separately.
- Supabase free-tier projects may pause or have quotas; evaluate your production availability and backup requirements.

## Minimum pre-launch acceptance tests

1. Admin logs in; Sales logs in. Sales cannot upload, edit, approve, or query raw asset/contact data through REST (verify with a Sales access token).
2. Sales submits two concurrent requests against the same HD; balance never becomes overdrawn.
3. Sales cannot submit unapproved capacity or override price/amount by manipulating browser requests.
4. Two Admins approve requests simultaneously against scarce stock; no duplicate asset tags are allocated; failed approvals roll back completely.
5. Rejection restores available balance; approval persists after refresh and from another device.
6. FIFO selects oldest available receipt date from the **assigned CFA only**.
7. All four Excel imports work with your actual master files; confirm row counts and mapping.
8. Check HD Name card, 20-per-page tables, light/dark theme, CSV exports and SDM/CFA email drafts.
9. Confirm email addresses, financial reconciliation, backup/restore and user offboarding process before go-live.

## Repository contents

```
index.html                 GitHub Pages entrypoint
styles.css                 Responsive light/dark styling
app.js                     Supabase-backed frontend logic
config.js                  Placeholder: edit with your public project URL/key
config.example.js          Configuration example
supabase/schema.sql        Database schema, RLS and transactional RPCs
templates/*.xlsx           Four input templates + audit export reference
README.md                  This setup guide
.gitignore                 Excludes local config from git CLI commits
```
