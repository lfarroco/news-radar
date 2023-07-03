#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  say "Starting automated run"
  make run
  say "Finished automated run"
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
