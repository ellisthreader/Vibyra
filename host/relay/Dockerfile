FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
ENV PORT=8788 BIND_ADDRESS=0.0.0.0
EXPOSE 8788
CMD ["node", "src/main.mjs"]
