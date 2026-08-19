FROM node:22.12-alpine

RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
