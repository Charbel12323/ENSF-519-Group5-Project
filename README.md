## Demo Video



https://github.com/user-attachments/assets/7d6f760e-ece0-4eec-98a6-6245045bd8de










Boardly

A simple Jira-style Kanban board built for a university group project.
Users can sign up, create a group, invite teammates, and manage tasks on a per-group Kanban board with a live stats dashboard.

## Features

- Email/password sign up and sign in (JWT-based auth)
- Create a group and invite teammates by email
- Kanban board per group with drag-and-drop across To Do / In Progress / Done
- Assign tasks to any group member
- Project dashboard: completion %, overdue/upcoming counts, status and workload charts, per-member progress, and a deadline list
- Calendar view of tasks by due date, with filters and drag-to-reschedule
- Timeline (Gantt) view with task start/due bars, milestones (owner-managed), and task dependencies
- Board, Calendar, Timeline and Dashboard all use the same task records

Task status for progress purposes comes from column position: the first column counts as "not started", the last as "done", and any others as "in progress".

## Project structure

```
backend/     Express API, Prisma schema and migrations
frontend/    Next.js App Router frontend
tests/e2e/   Selenium end-to-end tests
docker-compose.yml
docker-compose.ci.yml   CI overrides for running the Selenium suite in Docker
Jenkinsfile  CI/CD pipeline: tests PRs, deploys main
deploy/      Ansible playbook and Kubernetes manifests for the deploy
```

## Running it with Docker Compose

This is the easiest way to run the whole stack.

1. Make sure Docker Desktop is running.
2. From the repo root, run:

   ```bash
   docker compose up -d --build
   ```

3. Open the app:
   - Frontend: http://localhost:3000
   - Backend health check: http://localhost:4000/health

The backend automatically runs Prisma migrations on startup, so the database schema is created for you on first run.

To stop everything:

```bash
docker compose down
```

To stop and wipe the database too:

```bash
docker compose down -v
```

### Ports

- Frontend: `3000`
- Backend: `4000`
- Postgres: `5433` on the host (mapped to `5432` inside the container, to avoid clashing with a local Postgres install)

## Running it locally without Docker (optional)

You'll need Node.js 20+ and a running Postgres instance.

**Backend**

```bash
cd backend
cp .env.example .env   # edit DATABASE_URL if needed
npm install
npm run prisma:migrate
npm run dev
```

**Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Tests and CI

Unit tests use Vitest and live next to the code they test (`*.test.ts`).
Run them from `backend/` or `frontend/`:

```bash
npm test
```

The backend runs `prisma generate` before its tests, so a fresh checkout works without a database.

The Selenium suite is described in [tests/e2e/README.md](tests/e2e/README.md).

Jenkins runs the `Jenkinsfile` in the repo root as a Multibranch Pipeline.
Every pull request shows up on GitHub as three checks:

| Check | What it runs |
| --- | --- |
| `Jenkins / Unit tests` | Vitest for the backend and the frontend |
| `Jenkins / Lint, typecheck & build` | ESLint, the frontend typecheck and `npm run build` for both (the backend build type-checks it) |
| `Jenkins / Selenium E2E` | Builds the Docker images one at a time, starts the app and runs the full Selenium suite |

Each check's description says how long it took.
Selenium is skipped when unit tests or the build fail.

A merge to `main` isn't re-tested.
It reports two checks instead: `Jenkins / Publish images`, which pushes the backend and frontend images to Docker Hub, and `Jenkins / Deploy`, which deploys them to Kubernetes with Ansible.
See [deploy/README.md](deploy/README.md) for how the deploy works and the one-time setup.

Unit and Selenium results show up as JUnit reports on the Jenkins build.
The checks are posted with the "Pipeline: GitHub Notify Step" plugin, using the GitHub credentials of the multibranch job.
The Jenkins agent needs Docker with Compose v2.24 or newer, and the Jenkins user must be in the `docker` group.
The CI machine has 2 GB of RAM, so steps run one at a time and the frontend's production build uses webpack with memory optimizations (see `frontend/next.config.js`).

## Environment variables

**backend/.env**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret used to sign JWTs - use a long random string in production |
| `PORT` | Port the API listens on (default `4000`) |
| `CORS_ORIGIN` | Allowed origin for the frontend (default `http://localhost:3000`) |
| `APP_URL` | Public frontend URL, used in email links (default `http://localhost:3000`) |
| `API_URL` | Public URL the browser uses for `/api`, which is the frontend origin since it proxies `/api` (default `http://localhost:3000`) |

**frontend/.env**

| Variable | Description |
|---|---|
| `BACKEND_INTERNAL_URL` | Where the Next.js server forwards `/api` requests, read at build time (default `http://localhost:4000`; the Docker image uses `http://backend:4000`) |

The browser only talks to the frontend, which forwards `/api/*` to the backend.

## Data model

- **User** - account with hashed password
- **Group** - a team/project, has an owner and members
- **GroupMember** - join table with role (`OWNER` / `MEMBER`)
- **GroupInvite** - pending/accepted/declined invite by email
- **Column** - a board section (`To Do`, `In Progress`, `Done`), seeded automatically when a group is created
- **Task** - belongs to a group and a column, optionally assigned to a member, with optional `startDate` / `dueDate`
- **TaskDependency** - "task depends on task" link within a group (cycles are rejected)
- **Milestone** - a dated project checkpoint shown on the timeline

## Known issues

- `npm audit` flags a high-severity advisory in `deepmerge-ts`, pulled in transitively by the `prisma` CLI package (`@prisma/config`).
  This only affects the Prisma CLI at build/migrate time (parsing our own trusted config files), not the `@prisma/client` runtime code that serves requests, and no fixed release currently avoids it without a significant downgrade.
