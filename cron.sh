#!/bin/sh  
while true  
do  
  echo "Starting automated run at $(date)"

  if !  make run ; then
    echo "Failed to run scanner"
    break
  fi

  git checkout publish
  git merge main

  if !  make build-pages ; then
    echo "Failed to build pages"
    git checkout main
    break
  fi

  git add _site/
  git commit -m "automated run at $(date)"
  git push origin publish
  make dump-db
  git checkout main

  echo "Finished running at $(date)"
  #every hour 
  sleep 3600
done
