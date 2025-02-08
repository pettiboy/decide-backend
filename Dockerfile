# Builder Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy prisma folder and generate Prisma Client
COPY prisma prisma/
RUN npx prisma generate

# Copy the rest of the app and build
COPY . .
RUN npm run build

# Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy build artifacts from the builder stage
COPY --from=builder /app/dist ./dist
COPY prisma prisma/

EXPOSE 3000
CMD ["npm", "start"]
