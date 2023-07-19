#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  deno run -A src/local.ts
  deno task build
  git add .
  git commit -m "automated run"
  git push origin main
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
