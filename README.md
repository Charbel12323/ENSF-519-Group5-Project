## Demo Video




https://github.com/user-attachments/assets/05c6594d-cd0f-4ea7-8a39-436eacb2f535











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
docker-compose.yml
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

## Environment variables

**backend/.env**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret used to sign JWTs - use a long random string in production |
| `PORT` | Port the API listens on (default `4000`) |
| `CORS_ORIGIN` | Allowed origin for the frontend (default `http://localhost:3000`) |

**frontend/.env**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API |

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
