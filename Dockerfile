FROM node:20.18.1-alpine AS builder
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci
COPY src/ .
RUN npm run build

FROM node:20.18.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
