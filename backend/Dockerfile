FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Prisma CLI is a devDependency but `migrate deploy` runs at startup, so bring
# the generated client and the CLI over from the build stage instead of
# shipping the whole dev toolchain.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/index.js"]
