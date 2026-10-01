"""Dashboard counts."""
from selenium.webdriver.common.by import By

from conftest import (
    BASE_URL, OVERDUE_TASK, clickable, stat_tile, visible,
)


def test_dashboard_counts(driver, teammate, group_id):
    driver.get(f"{BASE_URL}/dashboard/{group_id}")
    visible(driver, By.XPATH, "//p[normalize-space()='Project completion']")

    assert stat_tile(driver, "Total tasks") == 3
    assert stat_tile(driver, "Completed") == 1
    assert stat_tile(driver, "In progress") == 1
    assert stat_tile(driver, "Not started") == 1
    assert stat_tile(driver, "Overdue") == 1
    visible(driver, By.XPATH, "//*[name()='svg'][@aria-label='33% complete']")

    # Team progress row for the teammate: 1 assigned, 0 completed, 1 in progress, 1 overdue.
    row = visible(driver, By.XPATH, f"//tr[.//p[contains(., '{teammate.email}')]]")
    assert [td.text for td in row.find_elements(By.XPATH, "./td")[1:5]] == ["1", "0", "1", "1"]

    # Deadlines list: the overdue tab shows only the overdue task.
    clickable(driver, By.XPATH, "//button[@role='tab'][starts-with(normalize-space(),'Overdue')]").click()
    items = driver.find_elements(By.XPATH, "//section[.//h2[normalize-space()='Deadlines']]//li")
    assert len(items) == 1 and OVERDUE_TASK[0] in items[0].text
