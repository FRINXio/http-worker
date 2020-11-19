FROM node:12
RUN npm install -g nodemon

WORKDIR /http-worker
COPY conductor-poller/ conductor-poller
COPY shared/ shared
COPY package.json .
COPY yarn.lock .
COPY babel.config.js .
RUN yarn install --frozen-lockfile && yarn cache clean

CMD ["yarn", "run", "start:poller"]
