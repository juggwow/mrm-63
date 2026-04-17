FROM node:18-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

RUN npx playwright install chromium --with-deps

COPY . .

RUN npm run build

RUN npm prune --production

CMD ["node", "dist/index.js"] 