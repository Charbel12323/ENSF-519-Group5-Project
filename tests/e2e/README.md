# Selenium end-to-end tests

Covers sign up / sign in, creating a group, inviting a teammate, creating, assigning and moving tasks, dashboard counts, and calendar deadlines and overdue tasks.

Requires Google Chrome. Selenium Manager downloads a matching chromedriver automatically.

## Run

1. Start Docker Desktop.
2. From the repo root, start the app plus Mailpit (used to read the email-verification links). `AUTH_RATE_LIMIT` raises the auth limit (default 30 requests / 15 min) so repeated runs aren't blocked.

   ```powershell
   # PowerShell
   $env:AUTH_RATE_LIMIT = "1000"; docker compose --profile mail up -d --build
   ```

   ```bash
   # bash
   AUTH_RATE_LIMIT=1000 docker compose --profile mail up -d --build
   ```

3. Install the dependencies and run the tests:

   ```powershell
   cd tests\e2e
   pip install -r requirements.txt
   python -m pytest -v
   ```

   Use `python -m pytest` rather than `pytest`: with a per-user pip install, the `pytest` command often isn't on your PATH.

   Add `-x` to stop at the first failure.

## Watching the tests

By default the tests run in a hidden (headless) browser at full speed. To watch them in a visible Chrome window, slowed down so each step can be followed:

```powershell
$env:HEADLESS = "0"; $env:SLOW_MO = "1"; python -m pytest -v
```

- `HEADLESS = "0"` opens a visible Chrome window.
- `SLOW_MO = "1"` pauses 1 second after every click, typed value and page load. Use `0.5` for faster or `2` for slower. The browser also stays open a few seconds at the end.

To go back to headless, full-speed runs in the same terminal:

```powershell
Remove-Item Env:HEADLESS, Env:SLOW_MO
```

### Recording a run

- Press **Win + Alt + R** to start and stop a screen recording (Xbox Game Bar), or use OBS.
- Start recording before running the command so the browser opening is captured.
- Each test depends on the earlier ones, so run the whole suite. Either record the whole run (about a minute and a half with `SLOW_MO = "1"`) or trim the video to one test afterwards. `test_06_move_task.py` (dragging cards across the board) and `test_04_create_task.py` are the most visual.

## Environment variables

| Variable          | Default                 | Purpose                                              |
|-------------------|-------------------------|------------------------------------------------------|
| `BOARDLY_URL`     | `http://localhost:3000` | Frontend URL                                         |
| `MAILPIT_URL`     | `http://127.0.0.1:8025` | Mailpit web/API URL                                  |
| `HEADLESS`        | `1`                     | Set to `0` to show the browser                       |
| `SLOW_MO`         | `0`                     | Seconds to pause after each click, input and page load |
| `AUTH_RATE_LIMIT` | `30`                    | Backend auth requests allowed per IP per 15 minutes (set when starting Docker) |

## How the suite is organised

There is one file per flow (`test_01_auth.py` … `test_08_calendar.py`). The number prefixes make pytest run them in order, and each file builds on the ones before it, so run the whole folder. A file run on its own skips its tests, because the group it needs hasn't been created. Shared helpers and test data live in `conftest.py`. Every run creates fresh accounts with random emails, so you can re-run them against the same database.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `pytest` is not recognized | Run `python -m pytest -v` instead. |
| `ERR_CONNECTION_REFUSED` | The app isn't running. Start Docker Desktop and run the `docker compose` command above. |
| Tests skipped with "Mailpit not reachable" | Docker was started without `--profile mail`. |
| "Auth failed: Too many attempts" | The auth rate limit was hit. Run `docker compose restart backend` to reset it, or start Docker with `AUTH_RATE_LIMIT` raised. |
