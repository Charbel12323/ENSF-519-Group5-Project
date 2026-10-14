"""Create tasks on the board."""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC

from conftest import (
    DONE_TASK, OVERDUE_TASK, UPCOMING_TASK, card_xpath, column, column_count, open_board, set_react_value, visible, wait,
)


def test_create_task(driver, group_id):
    open_board(driver, group_id)
    for title, due in (OVERDUE_TASK, UPCOMING_TASK, DONE_TASK):
        column(driver, "To Do").find_element(By.XPATH, ".//button[normalize-space()='+ Add task']").click()
        dialog = visible(driver, By.CSS_SELECTOR, "[role='dialog']")
        assert "New task" in dialog.text
        dialog.find_element(By.XPATH, ".//label[starts-with(normalize-space(),'Title')]/input").send_keys(title)
        if due:
            due_input = dialog.find_element(By.XPATH, ".//label[starts-with(normalize-space(),'Due date')]/input")
            set_react_value(driver, due_input, due.isoformat())
        dialog.find_element(By.XPATH, ".//button[normalize-space()='Create task']").click()
        wait(driver).until(EC.invisibility_of_element_located((By.CSS_SELECTOR, "[role='dialog']")))
        visible(driver, By.XPATH, card_xpath(title, "To Do"))

    assert column_count(driver, "To Do") == 3
    overdue_card = driver.find_element(By.XPATH, card_xpath(OVERDUE_TASK[0]))
    assert f"Due {OVERDUE_TASK[1].isoformat()}" in overdue_card.text
