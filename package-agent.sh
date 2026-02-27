#!/bin/bash
echo "Packaging agent for deployment..."
# Remove old zip if exists
rm -f agent-dist.zip

# Zip agent directory excluding unnecessary files
zip -r agent-dist.zip monitoring-agent -x "monitoring-agent/node_modules/*" "monitoring-agent/*.log" "monitoring-agent/.DS_Store" "monitoring-agent/venv/*" "monitoring-agent/__pycache__/*"

echo "Done! Transfer 'agent-dist.zip' to your remote VMs."
