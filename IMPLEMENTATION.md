# Boardly local setup and implemented features

The application now includes group and column management, task priorities and due dates,
labels, subtasks, comments, attachments, activity history, task search and filters,
My tasks, profile editing, password recovery, email verification, and Google sign-in.

## Run locally

For the simplest Windows setup, install **Docker Desktop** and enable its **WSL 2
backend / Linux containers**. Docker Desktop includes Docker Compose. Docker runs
Node.js, PostgreSQL, and Mailpit for you; those do not need separate host installs
for this approach. Keep ports 3000, 4000, 5433, 1025, and 8025 available.

Docker Desktop is already installed on this PC, but its Linux engine did not become
ready during setup. Open Docker Desktop and resolve any WSL/startup prompt before
running Compose. See the [Windows installation requirements](https://docs.docker.com/desktop/setup/install/windows-install/).

From the project root, on first setup:

```powershell
Copy-Item .env.example .env
```

Edit `.env`: replace `JWT_SECRET` with a long random secret and add the email/Google
settings below. Do not overwrite an existing `.env` when updating the project.
Then run:

```sh
docker compose up --build
```

Open Boardly at http://localhost:3000 and local email at http://localhost:8025.
Mailpit captures messages locally; it does not deliver to real inboxes. Signup sends
a verification email. Owners must verify their email to invite teammates, and invitees
must verify before accepting. Existing accounts also need to verify their email.

The backend container automatically applies migrations. The PostgreSQL data lives in
a Docker volume and survives ordinary restarts.

## Run Node.js directly instead of containerizing the app

Install **Node.js 22.x** (includes npm) and **PostgreSQL 16 or newer**. Git is useful
for development but is not needed by the running application. You also need an SMTP
server: run Mailpit through Docker for local preview, or use a real provider.
There is no separate global installation of Next.js, Prisma, or TypeScript; `npm ci`
installs the project's dependencies.

Alternatively, install only Node.js locally and let Docker supply the database and mail:

```powershell
docker compose up -d db mailpit
```

For the local backend, in its own terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm ci
# Edit .env before continuing. Do not overwrite an existing .env.
npm run prisma:deploy
npm run dev
```

The backend example uses database port **5433** (Docker's published port). A native
PostgreSQL installation normally uses **5432**: update `DATABASE_URL` and create the
database/user referenced by it. For local Mailpit, use `SMTP_HOST=localhost` and
`SMTP_PORT=1025` (the backend example already does this).

For the frontend, open another terminal at the project root:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

For a local production build, use `npm run build` then `npm start` in each app
instead of `npm run dev`. The frontend uses system fonts, without a Google Fonts
network dependency. Temporary portable runtimes and browser/database tooling used
during implementation have been removed; install Node.js normally for this workflow.

## Real email delivery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`.
Use `SMTP_SECURE=true` for implicit TLS (normally port 465); port 587 normally uses
STARTTLS with `SMTP_SECURE=false`. Keep certificate verification enabled.
Set `APP_URL` to the public frontend URL so email links point to the correct host.
For Compose, put these variables in a root `.env` file; for a local backend use
`backend/.env`. Never commit credentials.

Invitations persist even if SMTP delivery fails. The UI reports this explicitly, and
the owner can resend by inviting the same address again. Verification emails can be
resent from Profile. Password reset responses intentionally do not reveal whether an
account exists. SMTP failures are logged without credentials or message contents.

Reference: [Nodemailer SMTP configuration](https://nodemailer.com/smtp).

## Google sign-in

Create an OAuth client of type **Web application** in Google Cloud. Set:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the backend.
- `API_URL` to the public backend origin (default `http://localhost:4000`).
- `APP_URL` and `CORS_ORIGIN` to the frontend origin.
- An authorized redirect URI of `http://localhost:4000/api/auth/google/callback`
  locally, or `{API_URL}/api/auth/google/callback` in your deployment.

Restart the backend after changing configuration. The Google button appears only
when both credentials are configured. If your OAuth app is in testing mode, add the
accounts you intend to use as test users in Google Cloud.

New users can register through Google. Existing password accounts must sign in,
verify their email, and choose **Connect Google** in Profile using the same email.
Accounts are never silently linked just because email strings match. OAuth uses
state, nonce, PKCE, a short-lived HttpOnly cookie, validated Google ID tokens, and a
one-use login exchange code. Provider tokens are not retained.

Reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Behavior and permissions

- Owners rename/delete groups, invite/remove members, transfer ownership, and manage
  columns and labels. Members can leave. An owner must transfer ownership before leaving.
- Members create/edit/move/delete tasks and manage subtasks. Only comment authors can
  edit their comments; authors and owners can delete them. Uploaders and owners can
  remove attachments. All group members can download files.
- Removing/leaving a group unassigns that member's tasks. Task creation and updates
  reject assignees, columns, or labels outside the group.
- Task moves and group management acquire the same group row lock. Positions in both
  affected columns are normalized in one transaction. The migration repairs existing
  duplicate positions. Concurrent moves cannot leave duplicate order values.
- Deleting a nonempty column requires a destination; its tasks are moved, not discarded.
  Every group retains at least one column. Group deletion cascades through its content.
- Boards, group lists, dashboards, member lists, My tasks, and open task conversations
  refresh every five seconds while visible, and on window focus. Board refresh pauses
  during dragging and editing. Dragging is disabled while filters hide tasks; the task
  form still allows status changes.
- Dates are calendar dates in `YYYY-MM-DD`, stored as PostgreSQL DATE. Due-date filters
  use the current UTC date, and include completed tasks if their date matches.
- Attachments are stored in PostgreSQL (and thus included in database backups), up to
  5 MB per file and 20 files per task. Downloads require membership and are served as
  attachments with `nosniff`, never as public executable content.
- Group activity supports pagination; task details show the latest 100 task events.
  Deleted-task events remain in group history. History is removed with the group.
- Reset and verification tokens are hashed in the database, expire, and are single-use.
  Password reset revokes existing sessions. Changing email also revokes sessions,
  clears verification, and disconnects Google. JWTs expire after seven days.

## Git hygiene

Git ignores dependencies, build output, environment files, credentials, downloaded
tooling, caches, logs, reports, local database data, and machine-specific editor files.
Environment examples, package lockfiles, Prisma schema, and migrations remain tracked.
Docker build contexts also exclude local environment files and generated artifacts.
