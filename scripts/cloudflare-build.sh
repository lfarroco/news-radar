#!/bin/sh

set -eu

if ! command -v deno >/dev/null 2>&1; then
	curl -fsSL https://deno.land/install.sh | sh
	export PATH="$HOME/.deno/bin:$PATH"
fi

deno task build