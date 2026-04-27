#!/bin/sh
set -e

set -a
. /workspace/.env.private.daveus
set +a

exec "$@"
