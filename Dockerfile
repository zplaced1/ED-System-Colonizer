# Use the official Bun image
FROM oven/bun:latest

# Create and set working directory
WORKDIR /app

# Copy package.json, bun.lockb, and tsconfig.json
COPY package.json ./

# Copy source files
COPY system-alerter.ts ./

# Install dependencies
RUN bun install

# Set proper signal handling
STOPSIGNAL SIGTERM

# Add health check
HEALTHCHECK --interval=5m --timeout=30s --retries=3 \
    CMD pgrep -f "bun.*system-alerter" || exit 1

# Add restart policy label
LABEL autoheal=true

# Set container to always restart unless explicitly stopped
LABEL com.docker.compose.restart_policy=always

# Run the system alerter
CMD ["bun", "run", "system-alerter.ts"]
