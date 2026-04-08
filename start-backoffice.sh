#!/bin/bash

# News Radar Backoffice - Quick Start Guide
# This script helps set up and run the backoffice system

set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

echo "📡 News Radar Backoffice Setup"
echo "=============================="
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✓ Docker and Docker Compose found"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cat > .env << 'EOF'
GROQ_API_KEY=your_key_here
DATABASE_URL=postgresql://root:root@postgres:5432/root
DB_HOST=postgres
DB_PORT=5432
API_PORT=8000
PROJECT_ROOT=/usr/src/app
EOF
    echo "✓ Created .env file (please update with your API keys)"
    echo ""
fi

echo "Starting News Radar with Backoffice..."
echo ""

# Start Docker containers
docker-compose up -d

echo "Waiting for API to become ready..."
max_attempts=30
attempt=1
until curl -fsS http://localhost:8000/api/status >/dev/null 2>&1; do
    if [ "$attempt" -ge "$max_attempts" ]; then
        echo ""
        echo "❌ API did not become ready in time."
        echo "Check logs: docker-compose logs app"
        exit 1
    fi

    printf "."
    attempt=$((attempt + 1))
    sleep 2
done

echo ""
echo "✓ API is ready"

echo ""
echo "✓ Services started!"
echo ""
echo "🌐 Access the backoffice at: http://localhost:8000"
echo ""
echo "Available endpoints:"
echo "  - UI: http://localhost:8000"
echo "  - API: http://localhost:8000/api/"
echo ""
echo "Tips:"
echo "  - View logs: docker-compose logs -f app"
echo "  - Stop services: docker-compose down"
echo "  - Run tasks through the UI or API"
echo ""
