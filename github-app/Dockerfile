FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
