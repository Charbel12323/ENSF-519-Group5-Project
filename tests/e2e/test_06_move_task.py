"""Move tasks across Kanban columns."""
from selenium.webdriver.common.by import By

from conftest import (
    DONE_TASK, OVERDUE_TASK, UPCOMING_TASK, card_xpath, column_count, drag_with_keyboard, open_board, visible, wait,
)


def test_move_task_across_columns(driver, group_id):
    open_board(driver, group_id)
    drag_with_keyboard(driver, OVERDUE_TASK[0], steps_right=1)
    visible(driver, By.XPATH, card_xpath(OVERDUE_TASK[0], "In Progress"))
    wait(driver).until(lambda d: column_count(d, "In Progress") == 1)

    drag_with_keyboard(driver, DONE_TASK[0], steps_right=2)
    visible(driver, By.XPATH, card_xpath(DONE_TASK[0], "Done"))
    wait(driver).until(lambda d: column_count(d, "Done") == 1)

    # Column positions are saved server-side.
    driver.refresh()
    visible(driver, By.XPATH, card_xpath(OVERDUE_TASK[0], "In Progress"))
    visible(driver, By.XPATH, card_xpath(DONE_TASK[0], "Done"))
    visible(driver, By.XPATH, card_xpath(UPCOMING_TASK[0], "To Do"))
    assert [column_count(driver, c) for c in ("To Do", "In Progress", "Done")] == [1, 1, 1]
