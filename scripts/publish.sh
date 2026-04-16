#!/bin/bash

# Configuration
PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
NPMRC_FILE=".npmrc"

echo "🚀 Preparing to publish $PACKAGE_NAME version $VERSION..."

# Cleanup trap to ensure .npmrc is removed
cleanup() {
  if [ -f "$NPMRC_FILE" ]; then
    echo "🧹 Cleaning up temporary $NPMRC_FILE..."
    rm "$NPMRC_FILE"
  fi
}
trap cleanup EXIT

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Run build
echo "🏗️ Building the project..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed. Aborting publish."
  exit 1
fi

# 3. Check NPM Token and setup authentication
echo "🔍 Checking NPM authentication..."

if [ -n "$NPM_TOKEN" ]; then
  echo "🔑 NPM_TOKEN found! Setting up automatic authentication..."
  # Create a project-local .npmrc for the session
  echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > "$NPMRC_FILE"
else
  echo "⚠️  NPM_TOKEN environment variable is not set."
  echo "💡 Suggestion: Export your token with: export NPM_TOKEN=your_npm_token_here"
  echo "   Or ensure you are logged in via 'npm login' if not using a token."
fi

# Verification of identity
npm whoami > /dev/null 2>&1

if [ $? -ne 0 ]; then
  echo "❌ Authentication failed. You are not logged into NPM and the token provided is invalid or missing."
  exit 1
fi

# 4. Publish
echo "📤 Publishing to NPM..."
# We use --access public for scoped packages
npm publish --access public

if [ $? -eq 0 ]; then
  echo "✅ Published successfully!"
else
  echo "❌ Publication failed."
  exit 1
fi
