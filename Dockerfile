FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
LABEL org.opencontainers.image.title="Semaphore UI MCP Server" \
      org.opencontainers.image.description="MCP server for Semaphore UI documentation and API" \
      org.opencontainers.image.source="https://github.com/setswei/semaphoreui-mcp" \
      org.opencontainers.image.url="https://hub.docker.com/r/setswei/semaphoreui-mcp" \
      org.opencontainers.image.licenses="MIT"
RUN apk add --no-cache git
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
RUN git clone --depth 1 https://github.com/semaphoreui/semaphore-docs.git /tmp/docs \
    && mv /tmp/docs/docs /docs \
    && rm -rf /tmp/docs
RUN addgroup -S mcp && adduser -S mcp -G mcp && chown -R mcp:mcp /app
USER mcp
ENV DOCS_DIR=/docs PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
