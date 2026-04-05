# Use Debian Bullseye slim + Node 20 as base for maximum apt compatibility
FROM node:20-bullseye-slim

# Install necessary system dependencies with --no-install-recommends to avoid GUI bloat
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Set up Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python packages (Whisper & yt-dlp)
# Force CPU PyTorch with explicit index and aggressively clear out pip cache
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir yt-dlp openai-whisper && \
    rm -rf /root/.cache/pip

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files first
COPY package.json package-lock.json ./

# Install Node dependencies and clear npm cache
RUN npm install && npm cache clean --force

# Install Playwright browser binaries (Chromium only)
# Playwright runs apt-get inside with-deps, so we must wipe apt lists again!
RUN npx playwright install chromium --with-deps && \
    rm -rf /root/.cache/ms-playwright/ffmpeg-* /root/.cache/ms-playwright/firefox-* /root/.cache/ms-playwright/webkit-* && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy the rest of the application code
COPY . .

# Build the Next.js app and aggressively delete Webpack build cache!
RUN npm run build && \
    rm -rf .next/cache && \
    rm -rf /tmp/*

# Expose the default Next.js port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
