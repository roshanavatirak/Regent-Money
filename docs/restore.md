# Database backups and restore

Every night at 02:00 IST, the **Nightly database backup** GitHub Action (`.github/workflows/db-backup.yml`):

1. dumps the app's data from Supabase (schemas `core`, `finance`, `wealth`),
2. checks the dump has the main tables (`core.users`, `finance.transactions`, `finance.income_records`),
3. encrypts it with your **age public key**, deletes the plain copy, and
4. keeps the encrypted file as a workflow artifact for **14 days**.

Nobody can read a backup without the **age private key**, including GitHub and anyone else with repo access.

---

## One-time setup

### 1. Make an encryption key pair (on your computer)

```bash
winget install FiloSottile.age
```

```bash
age-keygen -o regent-backup.key
```

It prints a line like `Public key: age1...`.

- **`regent-backup.key` is the private key.** Keep it **off GitHub and off the server**: a password manager plus one offline copy (e.g. a USB drive). If you lose it, the backups can't be opened.
- The `age1...` line is the public key. That one goes into GitHub.

### 2. Get the Supabase connection string

Supabase dashboard → **Connect** → **Session pooler** → copy the URI and put your database password in it:

```
postgresql://postgres.<project-ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Use the **Session pooler** one (IPv4). GitHub's runners can't reach the "Direct connection" address.

### 3. Add two repository secrets

GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the Session pooler URI from step 2 |
| `BACKUP_AGE_PUBLIC_KEY` | the `age1...` public key from step 1 |

### 4. Run it once by hand

GitHub → **Actions → Nightly database backup → Run workflow**. When it's green, the run page shows the backup file under **Artifacts**.

---

## Restore test (do this once now, then monthly)

Needs Docker Desktop and age on your computer. It restores into a temporary local database and **never touches Supabase**.

1. Download the latest backup from the workflow run's **Artifacts** and unzip it (GitHub zips artifacts). You get `regent-db-<date>.dump.age`.
2. Run:

```bash
bash scripts/db/restore-test.sh regent-db-<date>.dump.age path/to/regent-backup.key
```

It prints the row count of every table plus users, transactions and income records. If those look right, the backup works.

---

## Real restore (only if data is lost)

1. **Stop writes:** suspend the Render service so nothing writes while you restore.
2. Decrypt the backup:

```bash
age --decrypt --identity regent-backup.key --output backup.dump regent-db-<date>.dump.age
```

3. Restore into Supabase. **This replaces the tables in these schemas**, so take a fresh backup first if the database is still reachable:

```bash
pg_restore --dbname "<Session pooler URI>" --clean --if-exists --no-owner --no-privileges --schema=core --schema=finance --schema=wealth backup.dump
```

4. Start the Render service again, log in on a test phone and check the data.
5. Delete `backup.dump` when you're done: it's unencrypted.

To restore a single table instead (for example one user's deleted rows), restore into a local database with `restore-test.sh`, copy out only the rows you need, and insert them into Supabase.

---

## Good to know

- **Kept for 14 days.** To keep a backup longer, download it and store it somewhere safe; it stays encrypted.
- **What's not included:** Supabase's own `auth` and `storage` schemas. Regent doesn't use Supabase Auth or Storage; user accounts live in `core.users`. Screenshots are on Cloudinary.
- **A failed backup** shows a red run in GitHub Actions, and GitHub emails you by default. The run fails on purpose if the dump looks incomplete.
- **Supabase Pro** adds managed daily backups. Keep this workflow anyway as an independent copy.
