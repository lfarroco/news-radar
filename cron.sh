#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"

  if !  make run ; then
    echo "Failed to run scanner"
    break
  fi

  if !  make build-pages ; then
    echo "Failed to build pages"
    break
  fi

  git add .
  git stash
  git checkout publish
  git stash pop
  git add _site/
  git commit -m "automated run at $(date)"
  git push origin publish
  make dump-db
  git checkout main

  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
