#!/bin/sh  
while true  
do  
  #only run if there's a git change
  if [ -n "$(git status --porcelain)" ]; then
    make run
    echo "Finished running at: $(date). Next check in 1 hour."
  else
    echo "No changes in repo at: $(date). Next check in 1 hour."
  fi
  #every hour 
  sleep 3600
done
