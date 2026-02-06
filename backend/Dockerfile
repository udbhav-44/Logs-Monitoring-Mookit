FROM node:18-alpine

WORKDIR /app

# Copy package files first to leverage cache
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 5002

# Start the server
CMD ["node", "server.js"]
