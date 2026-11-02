# Production image for the Prayer Community Platform (Next.js + Prisma).
# Override with e.g. --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-slim
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE} AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dev dependencies are kept so `npm run admin:create` and `db:seed` (tsx) work inside the container.
RUN npm run build

FROM ${NODE_IMAGE} AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
USER node
EXPOSE 3000
# Apply pending migrations, then serve. Run migrations as a separate release step if you scale out.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT}"]
