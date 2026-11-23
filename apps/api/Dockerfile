FROM node:22-alpine AS builder
WORKDIR /app

# Install workspace dependencies cleanly
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --ignore-scripts

# Build shared types + NestJS API
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @tcms/shared && npm run build -w @tcms/api

# Prune devDependencies for lean runtime image
# RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOAD_DIR=/app/apps/api/uploads

# Copy production node_modules, built shared package, API dist, and Excel/Logo assets
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /app/apps/api/dist /app/apps/api/dist
COPY --from=builder /app/apps/api/assets /app/apps/api/assets

RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
