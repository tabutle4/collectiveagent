#!/bin/bash

echo "🚀 Setting up Collective Agent..."
echo ""

# Install dependencies with stable Tailwind v3
echo "📦 Installing dependencies (using stable Tailwind CSS v3)..."
npm install

# Install stable Tailwind
echo "🎨 Installing Tailwind CSS v3..."
npm uninstall tailwindcss 2>/dev/null
npm install -D tailwindcss@3 postcss autoprefixer
npm install lucide-react@latest

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
