FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js bot.mjs ./

ENV NODE_ENV=production
CMD ["node", "index.js"]
