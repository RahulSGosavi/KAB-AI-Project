# Use Python 3.11 as base image
FROM python:3.11-slim

# Set base working directory
WORKDIR /app

# Install system dependencies required for PyMuPDF, Node.js, and build tools
# Ensure system libraries are installed first for smooth installation of Python packages later
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x (Required for Vite and modern tooling)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# --- PYTHON DEPENDENCIES ---
# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies (PyMuPDF now has required system libraries)
RUN pip install --no-cache-dir -r requirements.txt

# --- FRONTEND BUILD ---
# Assuming your Node project is in the 'frontend' subdirectory
WORKDIR /app/frontend

# Copy package files (requires package.json to be inside /app/frontend)
COPY frontend/package*.json ./

# Install Node.js dependencies (will install 'pdf-lib' here)
RUN npm install

# Copy the rest of the application (includes start_server.py in /app, and the frontend code)
WORKDIR /app
COPY . .

# Build the React frontend (running from the correct location)
# The output is expected in /app/frontend/dist or wherever your vite.config.js directs it.
# You may need to adjust the build command if it assumes a different directory.
RUN npm run build --prefix frontend -- --outDir /app/frontend/dist

# --- STARTUP ---
# Set default port
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the application
CMD python start_server.py
