"""Invite a teammate and have them accept."""
from selenium.webdriver.common.by import By

from conftest import (
    BASE_URL, GROUP_NAME, button, sign_in, visible,
)


def test_invite_teammate(driver, owner, teammate, group_id):
    driver.get(f"{BASE_URL}/groups/{group_id}/members")
    email_input = visible(driver, By.CSS_SELECTOR, "input[type='email'][placeholder='teammate@example.com']")
    email_input.send_keys(teammate.email)
    button(driver, "Send invitation").click()
    status = visible(driver, By.XPATH, "//*[@role='status']")
    assert "Invitation" in status.text

    # Teammate accepts the pending invite from their groups page.
    sign_in(driver, teammate)
    invite = visible(driver, By.XPATH, f"//div[contains(@class,'bg-amber-50')][contains(., '{GROUP_NAME}')]")
    invite.find_element(By.XPATH, ".//button[normalize-space()='Accept']").click()
    visible(driver, By.XPATH, f"//h3[normalize-space()='{GROUP_NAME}']")

    # Owner now sees the teammate in the member list.
    sign_in(driver, owner)
    driver.get(f"{BASE_URL}/groups/{group_id}/members")
    visible(driver, By.XPATH, f"//li[contains(., '{teammate.email}')][contains(., 'Member')]")
