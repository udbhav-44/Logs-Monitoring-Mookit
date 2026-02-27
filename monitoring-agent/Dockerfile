FROM node:20-alpine

WORKDIR /app

# Install system dependencies if required for systeminformation or other packages
RUN apk add --no-cache python3 make g++ docker-cli

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5001

CMD ["node", "agent.js"]
