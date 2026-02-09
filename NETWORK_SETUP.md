# Network Configuration Guide

This guide explains how to configure network access to your PostgreSQL + PostgREST setup for different scenarios.

## Understanding the Architecture

```
┌─────────────────────┐
│   React Frontend    │ (Port 5173 - Vite dev server)
│   (Your Browser)    │
└──────────┬──────────┘
           │
           │ HTTP Requests
           │
           ▼
┌─────────────────────┐
│     PostgREST       │ (Port 3000)
│    REST API         │
└──────────┬──────────┘
           │
           │ PostgreSQL Protocol
           │
           ▼
┌─────────────────────┐
│    PostgreSQL       │ (Port 5432)
│     Database        │
└─────────────────────┘
```

## Scenario 1: Local Development (Same Machine)

**Best for:** Development on your local machine

### Configuration

**Frontend and backend on the same machine:**

`.env` file:
```env
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
```

✅ **Works immediately** - no additional configuration needed

### Testing

```bash
# Terminal 1: Start PostgREST
docker-compose -f docker-compose.postgrest.yml up -d

# Terminal 2: Start React dev server
npm run dev

# Browser: Open http://localhost:5173
# The app will connect to PostgREST at http://localhost:3000
```

---

## Scenario 2: Same Local Network (LAN)

**Best for:** Testing from other devices on your network (phone, tablet, another computer)

### Configuration

1. **Find your server's IP address:**

```bash
# On Linux/Mac
hostname -I
# Example output: 192.168.1.100

# On Windows
ipconfig
# Look for IPv4 Address
```

2. **Update `.env` on the server:**

```env
VITE_POSTGREST_URL=http://192.168.1.100:3000
VITE_POSTGREST_ANON_KEY=anon
```

3. **Update `.env.postgrest`:**

```env
POSTGREST_PROXY_URI=http://192.168.1.100:3000
```

4. **Restart services:**

```bash
docker-compose -f docker-compose.postgrest.yml restart
```

### Testing

```bash
# From another device on the same network
curl http://192.168.1.100:3000/

# From browser on another device
# Navigate to: http://192.168.1.100:5173
```

### Firewall Rules

If you can't connect, you may need to allow ports:

```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp

# CentOS/RHEL
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --add-port=5173/tcp --permanent
sudo firewall-cmd --reload
```

---

## Scenario 3: Remote Access (Internet)

**Best for:** Accessing from anywhere on the internet

### Option A: ngrok (Temporary, Easy)

Perfect for demos and testing:

```bash
# Install ngrok
# Download from https://ngrok.com/download

# Expose PostgREST
ngrok http 3000

# You'll get a URL like: https://abc-123-def.ngrok-free.app
```

Update `.env`:
```env
VITE_POSTGREST_URL=https://abc-123-def.ngrok-free.app
```

⚠️ **Warning:** URL changes each time you restart ngrok (unless you have a paid plan)

### Option B: Cloudflare Tunnel (Permanent, Free)

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

# Create tunnel
cloudflared tunnel create traidenis-api

# Configure tunnel
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Run tunnel
cloudflared tunnel run traidenis-api
```

Update `.env`:
```env
VITE_POSTGREST_URL=https://api.yourdomain.com
```

### Option C: VPS with Domain (Production)

If you have a VPS with a domain:

**1. Install Nginx:**

```bash
sudo apt update
sudo apt install nginx
```

**2. Create Nginx configuration:**

```nginx
# /etc/nginx/sites-available/traidenis-api
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**3. Enable site:**

```bash
sudo ln -s /etc/nginx/sites-available/traidenis-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**4. Install SSL with Let's Encrypt:**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

**5. Update `.env`:**

```env
VITE_POSTGREST_URL=https://api.yourdomain.com
```

---

## Scenario 4: Docker Network (Everything Containerized)

**Best for:** Production deployment with all services in Docker

### Create unified docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: traidenis_postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgrest:
    image: postgrest/postgrest:latest
    container_name: traidenis_postgrest
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGREST_PASSWORD}@postgres:5432/${POSTGRES_DB}
      PGRST_DB_SCHEMA: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${POSTGREST_JWT_SECRET}
      PGRST_SERVER_CORS_ALLOWED_ORIGINS: "*"
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: traidenis_frontend
    environment:
      VITE_POSTGREST_URL: http://postgrest:3000  # Use Docker service name!
    ports:
      - "80:80"
    networks:
      - app-network
    depends_on:
      - postgrest

networks:
  app-network:
    driver: bridge

volumes:
  postgres_data:
```

### Create Dockerfile for frontend

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Create nginx.conf

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## CORS Configuration

### Development (Allow All)

`.env.postgrest`:
```env
CORS_ORIGINS=*
```

### Production (Specific Origins)

`.env.postgrest`:
```env
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## Environment Variables Summary

### Local Development

```env
# .env
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon

# .env.postgrest
POSTGREST_PROXY_URI=http://localhost:3000
CORS_ORIGINS=*
```

### Same Network

```env
# .env (replace with your IP)
VITE_POSTGREST_URL=http://192.168.1.100:3000
VITE_POSTGREST_ANON_KEY=anon

# .env.postgrest
POSTGREST_PROXY_URI=http://192.168.1.100:3000
CORS_ORIGINS=*
```

### Production

```env
# .env
VITE_POSTGREST_URL=https://api.yourdomain.com
VITE_POSTGREST_ANON_KEY=anon

# .env.postgrest
POSTGREST_PROXY_URI=https://api.yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## Testing Connectivity

### Test PostgREST from Command Line

```bash
# Local
curl http://localhost:3000/

# Same network
curl http://192.168.1.100:3000/

# Remote
curl https://api.yourdomain.com/
```

### Test from Browser Console

```javascript
// Open browser console (F12) on your frontend
fetch('http://localhost:3000/')
  .then(r => r.json())
  .then(data => console.log('PostgREST tables:', data))
  .catch(err => console.error('Connection failed:', err))
```

### Test Database Query

```bash
# Get webhooks
curl http://localhost:3000/webhooks

# Get projects
curl http://localhost:3000/nestandartiniai_projects

# Filter example
curl "http://localhost:3000/webhooks?is_active=eq.true"
```

---

## Troubleshooting

### "Failed to fetch" or "Network Error"

**Cause:** CORS or network configuration issue

**Fix:**
1. Check CORS_ORIGINS in `.env.postgrest`
2. Restart PostgREST: `docker-compose -f docker-compose.postgrest.yml restart postgrest`
3. Check browser console for specific error

### "Connection refused"

**Cause:** PostgREST not accessible on network

**Fix:**
1. Verify PostgREST is running: `docker ps | grep postgrest`
2. Check port binding: `docker port traidenis_postgrest`
3. Check firewall rules
4. Verify IP address is correct

### CORS Error in Browser

**Error:** `Access to fetch at 'http://...' from origin 'http://...' has been blocked by CORS policy`

**Fix:**

Update `docker-compose.postgrest.yml`:
```yaml
postgrest:
  environment:
    PGRST_SERVER_CORS_ALLOWED_ORIGINS: "*"  # Development
    # PGRST_SERVER_CORS_ALLOWED_ORIGINS: "https://yourdomain.com"  # Production
```

Restart:
```bash
docker-compose -f docker-compose.postgrest.yml restart postgrest
```

---

## Security Considerations

### Development

✅ Use `CORS_ORIGINS=*` for easy testing
✅ Use localhost URLs
✅ Simple passwords OK

### Production

⚠️ **MUST DO:**
- Use specific CORS origins (not `*`)
- Use HTTPS for PostgREST (via Nginx/Cloudflare)
- Use strong passwords
- Implement JWT authentication
- Use firewall rules to restrict PostgreSQL port 5432
- Enable SSL for PostgreSQL connections
- Regular security updates

---

## Quick Commands Reference

```bash
# Check if PostgREST is accessible
curl http://localhost:3000/

# Get server IP
hostname -I

# Test from another machine
curl http://<SERVER_IP>:3000/

# View PostgREST logs
docker logs -f traidenis_postgrest

# Restart PostgREST
docker-compose -f docker-compose.postgrest.yml restart postgrest

# Check what ports are open
sudo netstat -tulpn | grep :3000
```

---

## Next Steps

1. Choose your deployment scenario above
2. Update environment variables accordingly
3. Test connectivity using the testing commands
4. Deploy frontend with updated VITE_POSTGREST_URL
5. Verify everything works end-to-end

For more help, see:
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
- [POSTGREST_QUICKSTART.md](./POSTGREST_QUICKSTART.md)
