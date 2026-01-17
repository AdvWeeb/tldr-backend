# Build stage
FROM node:24-alpine AS build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

RUN npm ci

COPY --chown=node:node . .

RUN npm run build

RUN npm prune --production --ignore-scripts

# Production stage
FROM node:24-alpine AS production

WORKDIR /usr/src/app

COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules

COPY --chown=node:node --from=build /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/src/main.js"]