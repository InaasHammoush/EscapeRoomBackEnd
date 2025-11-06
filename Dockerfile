FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Quellen
COPY src ./src
COPY db ./db

# App-Start
EXPOSE 3000
CMD ["node", "src/server.js"]
