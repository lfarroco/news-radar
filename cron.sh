#!/bin/sh  
while true  
do  
  make run
  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
