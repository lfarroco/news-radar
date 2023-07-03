#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"
  make run
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
