# Selenium end-to-end tests

Covers sign up / sign in, creating a group, inviting a teammate, creating, assigning and moving tasks, dashboard counts, and calendar deadlines and overdue tasks.

## Run

```bash
# from the repo root: start the app plus Mailpit (used to read the email-verification links).
# AUTH_RATE_LIMIT raises the auth limit (default 30 requests / 15 min) so repeated runs aren't blocked.
# PowerShell: $env:AUTH_RATE_LIMIT = "1000"; docker compose --profile mail up -d --build
AUTH_RATE_LIMIT=1000 docker compose --profile mail up -d --build

cd tests/e2e
pip install -r requirements.txt
pytest -v
```

Requires Google Chrome. Selenium Manager downloads a matching chromedriver automatically.

Environment variables:

| Variable      | Default                 | Purpose                          |
|---------------|-------------------------|----------------------------------|
| `BOARDLY_URL` | `http://localhost:3000` | Frontend URL                     |
| `MAILPIT_URL` | `http://127.0.0.1:8025` | Mailpit web/API URL              |
| `HEADLESS`    | `1`                     | Set to `0` to watch the browser  |

There is one file per flow (`test_01_auth.py` … `test_08_calendar.py`). The number prefixes make pytest run them in order, and each file builds on the ones before it, so run the whole folder. A file run on its own skips its tests, because the group it needs hasn't been created. Shared helpers and test data live in `conftest.py`. Every run creates fresh accounts with random emails, so you can re-run them against the same database.
