FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN mkdir -p public
# Where /api is proxied to (see next.config.js). Baked into the build output.
ARG BACKEND_INTERNAL_URL=http://backend:4000
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The standalone server binds to $HOSTNAME, which Docker sets to the container id.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
