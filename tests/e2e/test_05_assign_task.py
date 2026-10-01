"""Assign a task to a teammate."""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select

from conftest import (
    OVERDUE_TASK, card_xpath, clickable, open_board, visible, wait,
)


def test_assign_task(driver, teammate, group_id):
    open_board(driver, group_id)
    clickable(driver, By.XPATH, card_xpath(OVERDUE_TASK[0])).click()
    dialog = visible(driver, By.CSS_SELECTOR, "[role='dialog']")
    assignee = dialog.find_element(By.XPATH, ".//label[starts-with(normalize-space(),'Assignee')]/select")
    Select(assignee).select_by_visible_text(teammate.name)
    dialog.find_element(By.XPATH, ".//button[normalize-space()='Save changes']").click()
    wait(driver).until(EC.invisibility_of_element_located((By.CSS_SELECTOR, "[role='dialog']")))

    avatar = visible(driver, By.XPATH, f"{card_xpath(OVERDUE_TASK[0])}//span[@title='{teammate.name}']")
    assert avatar.is_displayed()

    # Assignment persists across a reload.
    driver.refresh()
    visible(driver, By.XPATH, f"{card_xpath(OVERDUE_TASK[0])}//span[@title='{teammate.name}']")
