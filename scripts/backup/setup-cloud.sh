#!/usr/bin/env bash
set -euo pipefail
# Official PostgreSQL packages and a pinned, checksum-verified rclone release.
sudo install -d /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' | sudo tee /etc/apt/sources.list.d/agouz-pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y postgresql-client-18
curl --fail --silent --show-error -o "$RUNNER_TEMP/rclone.zip" https://downloads.rclone.org/v1.75.2/rclone-v1.75.2-linux-amd64.zip
echo "349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702  $RUNNER_TEMP/rclone.zip" | sha256sum --check
unzip -q "$RUNNER_TEMP/rclone.zip" -d "$RUNNER_TEMP/rclone"
docker pull public.ecr.aws/supabase/postgres:17.11.0.004
docker pull public.ecr.aws/supabase/gotrue:v2.197.0
docker pull public.ecr.aws/supabase/storage-api:v1.87.2
