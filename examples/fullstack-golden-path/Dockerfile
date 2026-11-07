FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY . .
EXPOSE 3000
CMD ["node", "src/backend/app.js"]
