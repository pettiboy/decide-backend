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

# Copy the node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy build artifacts and prisma folder from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "start"]
