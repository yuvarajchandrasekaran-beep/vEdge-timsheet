#!/bin/bash
# Uses the project-local Node.js runtime in .tools/node so nothing is installed system-wide.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$DIR/.tools/node/bin:$PATH"
exec "$@"
