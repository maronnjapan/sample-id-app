# JWT秘密鍵を設定
echo "$(grep JWT_PRIVATE_KEY .env | cut -d '=' -f2- | tr -d '\"')" | wrangler secret put JWT_PRIVATE_KEY
echo "$(grep JWT_PRIVATE_KEY .env | cut -d '=' -f2- | tr -d '\"')" 

# Worker URLを設定
echo "$(grep APP_URL .env | cut -d '=' -f2- | tr -d '\"')" | wrangler secret put APP_URL
echo "$(grep APP_URL .env | cut -d '=' -f2- | tr -d '\"')"
# 通知先URLを設定
echo "$(grep NOTIFY_URLS .env | cut -d '=' -f2- | tr -d '\"')" | wrangler secret put NOTIFY_URLS
echo "$(grep NOTIFY_URLS .env | cut -d '=' -f2- | tr -d '\"')"