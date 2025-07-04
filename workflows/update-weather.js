name: Update Weather Report

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  update-weather:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        
    - name: Update weather
      run: node update-weather.js
      
    - name: Commit changes
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add index.html
        if ! git diff --staged --quiet; then
          git commit -m "Auto-update weather report - $(date)"
          git push
        fi
