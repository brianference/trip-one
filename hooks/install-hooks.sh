#!/bin/bash
# Install git hooks
cp hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Git hooks installed (pre-push smoke tests)"
