FROM node:12 as http-worker
RUN npm install -g nodemon

WORKDIR /http-worker
COPY conductor-poller/ conductor-poller
COPY shared/ shared
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile && yarn cache clean

CMD ["node", "--unhandled-rejections=strict", "conductor-poller/start-conductor-poller.js"]
