#!/bin/bash
# trip-one smoke tests: run before every push, matching tokyo-one's pre-push discipline.
# Verifies the local build is sane before it ever reaches production.
set -e

echo "Running unit test suite..."
npm test -- --run

echo "Running TypeScript build check..."
npx tsc -b

echo "Building production bundle..."
npm run build > /dev/null

echo "All smoke checks passed."
