FROM node:20-slim
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
ENV NODE_ENV=production

CMD ["npm","start"]
