#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  make run
  make build-pages
  git add .
  git commit -m "automated run at $(date)"
  git push origin main
  echo "Finished running at $(date)"
  make dump-db
  #every hour 
  sleep 3600
done
