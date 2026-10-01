"""Create a group."""
from selenium.webdriver.common.by import By

from conftest import (
    GROUP_NAME, button, column_count, open_board, sign_in, visible,
)


def test_create_group(driver, owner, state):
    sign_in(driver, owner)
    button(driver, "New group").click()
    visible(driver, By.ID, "group-name").send_keys(GROUP_NAME)
    button(driver, "Create").click()

    card = visible(driver, By.XPATH, f"//h3[normalize-space()='{GROUP_NAME}']/ancestor::div[contains(@class,'rounded-xl')][1]")
    assert "Owner" in card.text
    board_href = card.find_element(By.LINK_TEXT, "Board").get_attribute("href")
    state["group_id"] = board_href.rstrip("/").split("/")[-1]

    open_board(driver, state['group_id'])
    for name in ("To Do", "In Progress", "Done"):
        assert column_count(driver, name) == 0
