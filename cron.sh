#!/bin/sh  
while true  
do  
  #every hour 
  make run
  echo "Finished running at: $(date). Next run in 1 hour."
  sleep 3600
done
