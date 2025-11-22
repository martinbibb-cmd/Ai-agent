#!/bin/bash
# Deployment script for Cloudflare Workers

echo "🚀 Deploying ai-agent to Cloudflare Workers..."
echo ""

# Deploy to production
echo "📦 Deploying to production..."
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📱 Your app is available at:"
echo "   https://ai-agent.martinbibb.workers.dev/"
echo "   https://ai-agent.martinbibb.workers.dev/documents.html"
echo "   https://ai-agent.martinbibb.workers.dev/test-upload.html"
echo ""
echo "🔧 Next steps:"
echo "   1. Visit the test-upload.html page on your mobile"
echo "   2. Click 'Migrate FTS Index' button"
echo "   3. Try uploading a file"
echo ""
