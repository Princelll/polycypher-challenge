#!/bin/bash
echo "=========================================="
echo "  Adaptive Learning Updater & Launcher"
echo "=========================================="
echo ""

REPO_DIR="$HOME/adaptive-learning"
EVENDEV_DIR="$HOME/even-dev"

# Step 1: Pull latest from adaptive-learning
echo "[1/4] Pulling latest changes from adaptive-learning..."
cd "$REPO_DIR" || { echo "ERROR: $REPO_DIR not found. Clone it first with:"; echo "  git clone https://github.com/Princelll/adaptive-learning.git ~/adaptive-learning"; exit 1; }
git checkout claude/frame-web-bluetooth-integration-wGvmo 2>/dev/null
git pull origin claude/frame-web-bluetooth-integration-wGvmo
if [ $? -ne 0 ]; then
    echo "ERROR: Git pull failed."
    read -p "Press enter to exit..."
    exit 1
fi

# Step 2: Copy updated files into even-dev/apps/adaptive-learning
echo ""
echo "[2/4] Copying updated files to even-dev/apps/adaptive-learning..."
cp -r "$REPO_DIR/src/"* "$EVENDEV_DIR/apps/adaptive-learning/src/"
cp "$REPO_DIR/index.html" "$EVENDEV_DIR/apps/adaptive-learning/index.html"
cp "$REPO_DIR/vite.config.ts" "$EVENDEV_DIR/apps/adaptive-learning/vite.config.ts"
echo "Files copied successfully!"

# Step 3: Install dependencies
echo ""
echo "[3/4] Installing dependencies..."
cd "$EVENDEV_DIR/apps/adaptive-learning"
npm install

# Step 4: Start the app
echo ""
echo "[4/4] Starting Adaptive Learning..."
cd "$EVENDEV_DIR"
./start-even.sh adaptive-learning
