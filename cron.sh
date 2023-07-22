#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  make run
  git add .
  git commit -m "automated run at $(date)"
  git push origin main
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
