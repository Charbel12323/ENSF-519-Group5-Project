"""Calendar deadlines and overdue tasks."""
from selenium.webdriver.common.by import By

from conftest import (
    BASE_URL, DONE_TASK, OVERDUE_TASK, UPCOMING_TASK, button, calendar_chip, clickable, show_month_of, visible, wait,
)


def test_calendar_deadlines_and_overdue(driver, group_id):
    driver.get(f"{BASE_URL}/groups/{group_id}/timeline?view=calendar")
    button(driver, "Today")

    show_month_of(driver, OVERDUE_TASK[1])
    overdue_chip = wait(driver).until(lambda d: calendar_chip(d, OVERDUE_TASK[0]))
    assert "· Overdue ·" in overdue_chip.get_attribute("title")
    # The chip sits in the cell for its due date.
    day_cell = overdue_chip.find_element(By.XPATH, "./ancestor::div[contains(@class,'min-h-[112px]')][1]")
    assert day_cell.find_element(By.XPATH, ".//span[1]").text == str(OVERDUE_TASK[1].day)

    show_month_of(driver, UPCOMING_TASK[1])
    upcoming_chip = wait(driver).until(lambda d: calendar_chip(d, UPCOMING_TASK[0]))
    assert "· To Do ·" in upcoming_chip.get_attribute("title")

    # Undated task is listed in the "No date" section rather than on a day.
    visible(driver, By.XPATH, f"//section[h3[starts-with(normalize-space(),'No date')]]//button[starts-with(@title,'{DONE_TASK[0]} ·')]")

    # "Overdue only" filter keeps just the overdue task.
    clickable(driver, By.XPATH, "//label[normalize-space()='Overdue only']/input").click()
    visible(driver, By.XPATH, "//p[contains(., '1 of 3 tasks match the filters')]")
    show_month_of(driver, OVERDUE_TASK[1])
    assert wait(driver).until(lambda d: calendar_chip(d, OVERDUE_TASK[0]))
    assert calendar_chip(driver, UPCOMING_TASK[0]) is None
