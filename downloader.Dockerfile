FROM node:12
RUN npm install -g nodemon

WORKDIR /http-worker
COPY downloader/ downloader
COPY shared/ shared
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile && yarn cache clean

CMD ["yarn start:downloader"]
