#!/bin/bash
# SoftwareSawit Environment Setup Script
# This script is idempotent - safe to run multiple times

set -e

echo "[init] Setting up SoftwareSawit development environment..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[init] ERROR: Node.js is not installed"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "[init] Node.js version: $NODE_VERSION"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "[init] Installing dependencies..."
    npm install
else
    echo "[init] Dependencies already installed"
fi

# Ensure data directory exists
mkdir -p data/master
mkdir -p data/kas/2026
mkdir -p data/bank/2026
mkdir -p data/gudang/2026

echo "[init] Environment setup complete!"
echo "[init] Available commands:"
echo "  npm run dev          - Start development (main + renderer)"
echo "  npm run dev:main     - Start main process only"
echo "  npm run dev:renderer - Start renderer only"
echo "  npm run build        - Build for production"
echo "  npm test             - Run tests"
echo "  npm run typecheck    - TypeScript type checking"
echo "  npm run lint         - ESLint"
