#!/bin/bash
# Install git hooks
cp hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Git hooks installed (pre-push smoke tests + pre-commit secret scan)"
