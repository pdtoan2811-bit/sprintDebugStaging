#!/bin/bash
# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "🚀 Starting Sprint Debugger..."

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time setup)..."
    npm install
fi

# Open the browser in the background
(sleep 5 && open http://localhost:3000) &

# Start the development server
npm run dev
