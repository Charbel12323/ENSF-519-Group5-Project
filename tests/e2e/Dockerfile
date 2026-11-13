# Runs the Selenium suite in headless Chromium so CI needs nothing but Docker.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-driver \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER=/usr/bin/chromedriver \
    E2E_IN_CONTAINER=1 \
    SE_OFFLINE=true \
    HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /e2e
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./

ENTRYPOINT ["python", "-m", "pytest", "-v", "-p", "no:cacheprovider", "--junitxml=/results/e2e.xml"]
