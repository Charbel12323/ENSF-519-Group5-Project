"""Shared fixtures and helpers for the Boardly Selenium end-to-end suite.

Requires the stack running with the Mailpit profile so verification emails can be read:
    docker compose --profile mail up -d --build
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pytest
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.events import AbstractEventListener, EventFiringWebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_URL = os.environ.get("BOARDLY_URL", "http://localhost:3000").rstrip("/")
# Used to set up accounts and the group directly when a test file runs on its own.
API_URL = os.environ.get("BOARDLY_API_URL", "http://127.0.0.1:4000/api").rstrip("/")
# 127.0.0.1 rather than localhost: docker-compose binds Mailpit to IPv4 only, and on Windows
# "localhost" tries IPv6 first, which is refused and can stall the request.
MAILPIT_URL = os.environ.get("MAILPIT_URL", "http://127.0.0.1:8025").rstrip("/")
HEADLESS = os.environ.get("HEADLESS", "1") != "0"
# Seconds to pause after each click, typed value and page load, so a person can follow along.
SLOW_MO = float(os.environ.get("SLOW_MO", "0"))
TIMEOUT = 15


@dataclass
class Account:
    name: str
    email: str
    password: str = "Password123!"
    verified: bool = False


def new_account(prefix: str) -> Account:
    suffix = uuid.uuid4().hex[:8]
    return Account(name=f"{prefix.title()} {suffix}", email=f"{prefix}-{suffix}@example.com")


@pytest.fixture(scope="session")
def driver():
    options = webdriver.ChromeOptions()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1600,1000")
    drv = webdriver.Chrome(options=options)
    if SLOW_MO:
        drv = EventFiringWebDriver(drv, _SlowMo())
    yield drv
    if SLOW_MO:
        time.sleep(SLOW_MO * 3)  # leave the final screen up briefly
    drv.quit()


class _SlowMo(AbstractEventListener):
    def after_navigate_to(self, url, driver):
        time.sleep(SLOW_MO)

    def after_click(self, element, driver):
        time.sleep(SLOW_MO)

    def after_change_value_of(self, element, driver):
        time.sleep(SLOW_MO)


@pytest.fixture(scope="session")
def new_owner() -> Account:
    """The group owner before signing up. test_01 signs it up through the browser."""
    return new_account("owner")


@pytest.fixture(scope="session")
def new_teammate() -> Account:
    return new_account("teammate")


@pytest.fixture
def owner(new_owner) -> Account:
    """The owner with a verified account, set up through the API if test_01 didn't run."""
    ensure_verified(new_owner)
    return new_owner


@pytest.fixture
def teammate(new_teammate) -> Account:
    ensure_verified(new_teammate)
    return new_teammate


_STATE: dict = {}


@pytest.fixture(scope="session")
def state() -> dict:
    """Values produced by earlier test files (e.g. the group id) and read by later ones."""
    return _STATE


@pytest.fixture
def group_id(state, owner) -> str:
    """The group test_02 created, or a new one made through the API if test_02 didn't run."""
    if "group_id" not in state:
        token = _api("POST", "/auth/login", {"email": owner.email, "password": owner.password})["token"]
        state["group_id"] = _api("POST", "/groups", {"name": GROUP_NAME}, token)["group"]["id"]
    return state["group_id"]


# ---------- test ordering ----------
# Tests that work on tasks made by earlier files declare it with @pytest.mark.needs("test_04_create_task", ...)
# and are skipped unless those files passed earlier in the same run.

_PASSED: set = set()


def pytest_configure(config):
    config.addinivalue_line("markers", "needs(*files): skip unless these earlier test files passed in this run")


def pytest_runtest_logreport(report):
    if report.when == "call" and report.passed:
        _PASSED.add(Path(report.nodeid.split("::")[0]).stem)


def pytest_runtest_setup(item):
    marker = item.get_closest_marker("needs")
    missing = [name for name in marker.args if name not in _PASSED] if marker else []
    if missing:
        pytest.skip(f"Needs {', '.join(missing)} to pass first in the same run")


# ---------- generic helpers ----------

def wait(driver, timeout=TIMEOUT):
    return WebDriverWait(driver, timeout)


def visible(driver, by, value, timeout=TIMEOUT):
    return wait(driver, timeout).until(EC.visibility_of_element_located((by, value)))


def clickable(driver, by, value, timeout=TIMEOUT):
    return wait(driver, timeout).until(EC.element_to_be_clickable((by, value)))


def button(driver, text, timeout=TIMEOUT):
    return clickable(driver, By.XPATH, f"//button[normalize-space()='{text}']", timeout)


def set_react_value(driver, element, value):
    """Set an input's value so React's onChange fires (send_keys on date inputs is locale-dependent)."""
    driver.execute_script(
        """
        const [el, value] = arguments;
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                    : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        """,
        element,
        value,
    )


# ---------- auth helpers ----------

def wait_for_dashboard(driver):
    """Wait for the post-auth redirect, failing with the form's error message if one appears."""
    error = (By.CSS_SELECTOR, "form div.bg-red-50")
    wait(driver).until(EC.any_of(EC.url_contains("/dashboard"), EC.visibility_of_element_located(error)))
    if "/dashboard" not in driver.current_url:
        message = driver.find_element(*error).text
        hint = " (auth rate limit hit: restart the backend or set AUTH_RATE_LIMIT)" if "Too many" in message else ""
        pytest.fail(f"Auth failed: {message}{hint}")
    visible(driver, By.XPATH, "//h1[normalize-space()='Your groups']")


def sign_out(driver):
    driver.get(f"{BASE_URL}/login")
    driver.execute_script("window.localStorage.clear();")


def sign_up(driver, account: Account):
    sign_out(driver)
    driver.get(f"{BASE_URL}/signup")
    visible(driver, By.ID, "name").send_keys(account.name)
    driver.find_element(By.ID, "email").send_keys(account.email)
    driver.find_element(By.ID, "password").send_keys(account.password)
    button(driver, "Create account").click()
    wait_for_dashboard(driver)


def sign_in(driver, account: Account):
    sign_out(driver)
    driver.get(f"{BASE_URL}/login")
    visible(driver, By.ID, "email").send_keys(account.email)
    driver.find_element(By.ID, "password").send_keys(account.password)
    button(driver, "Sign in").click()
    wait_for_dashboard(driver)


def _mailpit(path: str):
    with urllib.request.urlopen(f"{MAILPIT_URL}{path}", timeout=5) as res:
        return json.loads(res.read())


def verification_link(email: str, timeout=TIMEOUT) -> str:
    """Poll Mailpit for the newest verification email sent to `email` and return its link."""
    query = urllib.parse.quote(f'to:"{email}" subject:"Verify"')
    try:
        _mailpit("/api/v1/info")
    except OSError as err:
        pytest.skip(f"Mailpit not reachable at {MAILPIT_URL} ({err}); run `docker compose --profile mail up -d`")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            messages = _mailpit(f"/api/v1/search?query={query}").get("messages", [])
            if messages:
                text = _mailpit(f"/api/v1/message/{messages[0]['ID']}")["Text"]
                match = re.search(r"https?://\S+/verify-email#token=\S+", text)
                if match:
                    return match.group(0)
        except OSError:
            pass  # transient connection error; retry until the deadline
        time.sleep(0.5)
    raise AssertionError(f"No verification email for {email} arrived in Mailpit")


def verify_email(driver, account: Account):
    driver.get(verification_link(account.email))
    button(driver, "Verify email").click()
    visible(driver, By.XPATH, "//*[@role='status'][contains(., 'Your email is verified')]")
    account.verified = True


def _api(method: str, path: str, body: dict, token: str | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API_URL}{path}", data=json.dumps(body).encode(), headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read())


def ensure_verified(account: Account):
    """Sign up and verify `account` through the API, unless test_01 already did it in the browser."""
    if account.verified:
        return
    credentials = {"email": account.email, "password": account.password}
    try:
        user = _api("POST", "/auth/signup", {"name": account.name, **credentials})["user"]
    except urllib.error.HTTPError as err:
        if err.code != 409:  # 409: already signed up, e.g. by a test_01 that failed before verifying
            raise
        user = _api("POST", "/auth/login", credentials)["user"]
    if not user["emailVerified"]:
        token = verification_link(account.email).split("#token=", 1)[1]
        _api("POST", "/auth/verify-email", {"token": token})
    account.verified = True


# ---------- shared test data ----------

GROUP_NAME = "ENSF 519 Selenium Team"
TODAY = date.today()
OVERDUE_TASK = ("Write test plan", TODAY - timedelta(days=1))
UPCOMING_TASK = ("Prepare demo", TODAY + timedelta(days=3))
DONE_TASK = ("Set up repo", None)


# ---------- page helpers ----------

def column(driver, name):
    return visible(driver, By.XPATH, f"//section[h2[starts-with(normalize-space(), '{name}')]]")


def column_count(driver, name):
    return int(column(driver, name).find_element(By.XPATH, "./h2/span").text)


def card_xpath(title, column_name=None):
    scope = f"//section[h2[starts-with(normalize-space(), '{column_name}')]]" if column_name else ""
    return f"{scope}//div[@data-rfd-draggable-id][.//p[normalize-space()='{title}']]"


def open_board(driver, group_id):
    driver.get(f"{BASE_URL}/board/{group_id}")
    column(driver, "To Do")


def stat_tile(driver, label):
    return int(visible(driver, By.XPATH, f"//div[contains(@class,'panel')][p[normalize-space()='{label}']]/p[2]").text)


def drag_with_keyboard(driver, title, steps_right):
    """@hello-pangea/dnd supports keyboard dragging: Space to lift, arrows to move, Space to drop."""
    card = visible(driver, By.XPATH, card_xpath(title))
    driver.execute_script("arguments[0].focus();", card)
    actions = ActionChains(driver).send_keys(Keys.SPACE).pause(0.4)
    for _ in range(steps_right):
        actions.send_keys(Keys.ARROW_RIGHT).pause(0.4)
    actions.send_keys(Keys.SPACE).perform()


def calendar_chip(driver, title):
    chips = driver.find_elements(By.XPATH, f"//button[starts-with(@title, '{title} ·')]")
    return next((c for c in chips if c.is_displayed()), None)


def show_month_of(driver, day: date):
    button(driver, "Today").click()
    months = (day.year - TODAY.year) * 12 + day.month - TODAY.month
    label = "Next month" if months > 0 else "Previous month"
    for _ in range(abs(months)):
        clickable(driver, By.CSS_SELECTOR, f"button[aria-label='{label}']").click()
