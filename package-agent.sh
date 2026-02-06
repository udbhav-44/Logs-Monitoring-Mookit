#!/bin/bash
echo "Packaging agent for deployment..."
# Remove old zip if exists
rm -f agent-dist.zip

# Zip agent directory excluding node_modules and logs
zip -r agent-dist.zip agent -x "agent/node_modules/*" "agent/*.log" "agent/.DS_Store" "agent/logs" "agent/spool" "agent/.env" "agent/.offsets.json"

echo "Done! Transfer 'agent-dist.zip' to your remote VMs."
