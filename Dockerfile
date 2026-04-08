FROM denoland/deno

WORKDIR /usr/src/app

# Prefer not to run as root.
USER deno

# Cache all dependencies as a layer. Re-run when deno.json or source files change.
COPY deno.json .
COPY src ./src/

RUN deno cache src/main.ts src/source-scout.ts src/api.ts
