#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  say "Starting automated run at $(date)"
  make run
  finished "Finished running at $(date)"
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
