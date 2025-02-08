# Builder Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install full dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate Prisma Client
COPY prisma prisma/
RUN npx prisma generate

# Copy all source files and build
COPY . .
RUN npm run build

# Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copy package files (if needed for runtime scripts)
COPY package*.json ./

# Copy the node_modules folder from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy built artifacts and prisma folder from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy the entrypoint script and set executable permissions
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000
CMD ["./entrypoint.sh"]
