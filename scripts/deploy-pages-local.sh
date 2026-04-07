#!/bin/sh

set -eu

if ! command -v deno >/dev/null 2>&1; then
	curl -fsSL https://deno.land/install.sh | sh
	export PATH="$HOME/.deno/bin:$PATH"
fi

if ! command -v npx >/dev/null 2>&1; then
	echo "npx is required to run Wrangler. Install Node.js first." >&2
	exit 1
fi

# Build static output from local data sources.
deno task build

# Publish generated output directly to Pages.
npx wrangler pages deploy _site
