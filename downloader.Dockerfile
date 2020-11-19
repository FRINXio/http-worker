FROM node:12

WORKDIR /http-worker
COPY downloader/ downloader
COPY shared/ shared
COPY package.json .
COPY yarn.lock .
COPY babel.config.js .
RUN yarn install --frozen-lockfile && yarn cache clean

CMD ["yarn", "run", "start:downloader"]
