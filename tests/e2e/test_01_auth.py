"""Sign up and sign in."""
from selenium.webdriver.common.by import By

from conftest import (
    BASE_URL, button, sign_in, sign_out, sign_up, verify_email, visible,
)


def test_sign_up_and_sign_in(driver, owner, teammate):
    sign_up(driver, owner)
    verify_email(driver, owner)

    sign_out(driver)
    sign_in(driver, owner)
    assert owner.name in driver.page_source

    # Wrong password is rejected.
    sign_out(driver)
    driver.get(f"{BASE_URL}/login")
    visible(driver, By.ID, "email").send_keys(owner.email)
    driver.find_element(By.ID, "password").send_keys("not-the-password")
    button(driver, "Sign in").click()
    visible(driver, By.XPATH, "//div[contains(@class,'bg-red-50')]")
    assert "/login" in driver.current_url

    # The teammate also needs a verified account to accept invitations later.
    sign_up(driver, teammate)
    verify_email(driver, teammate)
