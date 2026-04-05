#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"

  if ! make run ; then
    echo "Failed to run scanner"
    break
  fi

  if ! make build-pages ; then
    echo "Failed to build pages"
    break
  fi

  if ! make dump-db ; then
    echo "Failed to dump database backup"
    break
  fi

  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
