#!/bin/sh
set -e

sudo /usr/local/bin/setup-muteworker.sh

set -a
. /workspace/.env.private.daveus
set +a

exec "$@"
