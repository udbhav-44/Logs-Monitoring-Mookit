#!/bin/bash
echo "Packaging agent for deployment..."
# Remove old zip if exists
rm -f agent-dist.zip

# Zip agent and monitoring-agent directories excluding unnecessary files
zip -r agent-dist.zip agent monitoring-agent -x "*/node_modules/*" "*.log" "*/.DS_Store" "*/venv/*" "*/__pycache__/*" "*/.dockerignore" "*/Dockerfile"

echo "Done! Transfer 'agent-dist.zip' to your remote VMs."
