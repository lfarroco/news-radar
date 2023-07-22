#!/bin/sh  
echo "start!"
deno run -A src/main.ts
deno task build
echo "end!"