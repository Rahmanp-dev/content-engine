# Use Debian Bullseye slim + Node 20 as base for maximum apt compatibility
FROM node:20-bullseye-slim

# Install necessary system dependencies (Python, FFmpeg, etc)
# - python3, pip, venv (for Whisper & yt-dlp)
# - ffmpeg (for decoding video audio)
# - git (sometimes needed for python packages)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment (avoids PEP 668 managed-environment errors)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python packages (Whisper & yt-dlp)
# We strictly install the CPU version of PyTorch first to prevent Whisper from downloading 4GB of NVIDIA CUDA drivers!
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir yt-dlp openai-whisper

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files first to utilize Docker layer caching
COPY package.json package-lock.json ./

# Install Node dependencies
RUN npm install

# Install Playwright browser binaries (Chromium only, to save space)
# We need the --with-deps flag to install missing linux system libraries for Chromium
RUN npx playwright install chromium --with-deps

# Copy the rest of the application code
COPY . .

# Build the Next.js app
RUN npm run build

# Expose the default Next.js port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
