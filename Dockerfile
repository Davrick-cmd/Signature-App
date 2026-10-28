# Single image: builds the React app and serves it from the Express API
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG VITE_APP_NAME=SignFlow
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node
EXPOSE 3001
VOLUME ["/app/server/uploads"]
CMD ["npm", "start"]
