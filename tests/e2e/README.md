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

- Record the whole screen with the Snipping Tool (**Win + Shift + R**, then select the full screen) or OBS.
  Game Bar (**Win + Alt + R**) only records the window that was focused when you started, so it misses the Chrome window the tests open.
- Start recording before running the command so the browser opening is captured.
- To record one flow, run just its file, for example `python -m pytest -v test_03_invite_teammate.py`.
  You can also list a few files, such as `test_02_create_group.py test_03_invite_teammate.py` to show creating a group and inviting a teammate.
  See [How the suite is organised](#how-the-suite-is-organised) for which files can run on their own.

## Environment variables

| Variable          | Default                     | Purpose                                                                                 |
|-------------------|-----------------------------|-----------------------------------------------------------------------------------------|
| `BOARDLY_URL`     | `http://localhost:3000`     | Frontend URL                                                                            |
| `BOARDLY_API_URL` | `http://127.0.0.1:4000/api` | Backend API URL, used to set up accounts and the group when a test file runs on its own |
| `MAILPIT_URL`     | `http://127.0.0.1:8025`     | Mailpit web/API URL                                                                     |
| `HEADLESS`        | `1`                         | Set to `0` to show the browser                                                          |
| `SLOW_MO`         | `0`                         | Seconds to pause after each click, input and page load                                  |
| `AUTH_RATE_LIMIT` | `30`                        | Backend auth requests allowed per IP per 15 minutes (set when starting Docker)          |

## How the suite is organised

There is one file per flow (`test_01_auth.py` … `test_08_calendar.py`), and the number prefixes make pytest run them in order.
Shared helpers and test data live in `conftest.py`.
Every run creates fresh accounts with random emails, so you can re-run them against the same database.

Tests 01 to 04 can run on their own.
If the accounts or the group they need weren't created by an earlier test in the same run, `conftest.py` creates them through the backend API (verifying the emails through Mailpit), so the browser only shows the flow being tested.

Tests 05 to 08 work on the tasks created by test 04, so they are marked with `@pytest.mark.needs(...)`.
They are skipped unless the files they depend on passed earlier in the same run:

| File | Needs |
|------|-------|
| `test_05_assign_task.py` | `test_03`, `test_04` |
| `test_06_move_task.py` | `test_04` |
| `test_07_dashboard.py` | `test_05`, `test_06` |
| `test_08_calendar.py` | `test_04` |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `pytest` is not recognized | Run `python -m pytest -v` instead. |
| `ERR_CONNECTION_REFUSED` | The app isn't running. Start Docker Desktop and run the `docker compose` command above. |
| Tests skipped with "Mailpit not reachable" | Docker was started without `--profile mail`. |
| "Auth failed: Too many attempts" | The auth rate limit was hit. Run `docker compose restart backend` to reset it, or start Docker with `AUTH_RATE_LIMIT` raised. |
