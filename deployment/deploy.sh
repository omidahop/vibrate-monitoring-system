#!/bin/bash

# Vibrate Monitoring System - Production Deployment Script
# Ubuntu VPS Deployment

set -e

# Configuration
PROJECT_NAME="vibrate-monitoring-system"
DOMAIN="31.56.205.135"
EMAIL="ahoopay.omid@gmail.com"
DB_PASSWORD="$(openssl rand -base64 32)"
JWT_SECRET="$(openssl rand -base64 64)"
SUPER_ADMIN_PASSWORD="$(openssl rand -base64 16)"

echo "🚀 Starting deployment of Vibrate Monitoring System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
CURRENT_USER=$(whoami)
if [ "$CURRENT_USER" = "root" ]; then
    print_error "This script should not be run as root for security reasons"
    exit 1
fi

# Check Ubuntu version
if ! grep -q "Ubuntu" /etc/os-release; then
    print_error "This script is designed for Ubuntu. Other distributions may not work properly."
    exit 1
fi

print_status "Detected OS: $(lsb_release -d | cut -f2)"

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    htop \
    nginx \
    bc \
    mailutils

# Install Docker
print_status "Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "${USER}"
    rm get-docker.sh
    print_success "Docker installed successfully"
else
    print_success "Docker is already installed"
fi

# Install Docker Compose
print_status "Installing Docker Compose..."
if ! command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed successfully"
else
    print_success "Docker Compose is already installed"
fi

# Setup firewall
print_status "Configuring firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
print_success "Firewall configured"

# Setup fail2ban
print_status "Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime = 1800
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
print_success "Fail2ban configured"

# Create project directory
print_status "Setting up project directory..."
PROJECT_DIR="/home/${USER}/${PROJECT_NAME}"
mkdir -p "${PROJECT_DIR}"
cd "${PROJECT_DIR}"

# Clone or update project
if [ ! -d ".git" ]; then
    print_status "Cloning project repository..."
    print_warning "Repository URL not specified. Please clone your project manually."
else
    print_status "Updating project repository..."
    git pull origin main
fi

# Create environment file
print_status "Creating environment configuration..."
cat >.env <<EOF
# Database Configuration
COUCHDB_PASSWORD=${DB_PASSWORD}
COUCHDB_SECRET=$(openssl rand -base64 32)

# JWT Configuration
JWT_SECRET=${JWT_SECRET}

# Admin Configuration
SUPER_ADMIN_EMAIL=${EMAIL}
SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD}

# Domain Configuration
FRONTEND_URL=https://${DOMAIN}

# Environment
NODE_ENV=production
EOF

# Create directories
print_status "Creating required directories..."
mkdir -p logs/nginx
mkdir -p deployment/ssl
mkdir -p frontend/public/icons

# Set permissions
sudo chown -R "${USER}:${USER}" "${PROJECT_DIR}"
chmod 600 .env

# Generate PWA icons
print_status "Setting up PWA icons..."
for size in 72 96 128 144 152 192 384 512; do
    touch "frontend/public/icons/icon-${size}x${size}.png"
done

# SSL Certificate setup with Let's Encrypt
if [ "${DOMAIN}" != "your-domain.com" ]; then
    # Check if domain is IP address
    if echo "${DOMAIN}" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' >/dev/null; then
        print_warning "Using IP address instead of domain. SSL setup will be skipped."
    else
        print_status "Setting up SSL certificate..."
        
        # Install certbot
        sudo apt install -y certbot python3-certbot-nginx
        
        # Create web root directory
        sudo mkdir -p /var/www/html
        
        # Create temporary nginx config
        sudo tee "/etc/nginx/sites-available/temp-${DOMAIN}" >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    
    root /var/www/html;
    
    location / {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF
        
        sudo ln -sf "/etc/nginx/sites-available/temp-${DOMAIN}" /etc/nginx/sites-enabled/
        sudo nginx -t && sudo systemctl reload nginx
        
        # Get SSL certificate
        if sudo certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" --email "${EMAIL}" --agree-tos --non-interactive; then
            # Copy certificates to project
            sudo cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" deployment/ssl/
            sudo cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" deployment/ssl/
            sudo chown "${USER}:${USER}" deployment/ssl/*
            
            # Setup auto-renewal
            echo "0 12 * * * /usr/bin/certbot renew --quiet && docker-compose restart nginx" | sudo crontab -
            
            print_success "SSL certificate configured"
        else
            print_warning "SSL certificate setup failed. Continuing without SSL."
        fi
    fi
else
    print_warning "Domain not configured, skipping SSL setup"
fi

# Build and start services
print_status "Building and starting services..."

# Ensure user is in docker group
if ! groups "${USER}" | grep -q docker; then
    print_status "Adding user to docker group..."
    sudo usermod -aG docker "${USER}"
    print_warning "User added to docker group. Please log out and log back in, then run: docker-compose up -d"
fi

# Check if docker-compose file exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please ensure your project repository is properly cloned."
    print_warning "You can manually create docker-compose.yml or clone your repository."
else
    # Build services
    docker-compose build --no-cache
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 30
    
    # Check service health
    print_status "Checking service health..."
    for i in {1..30}; do
        if docker-compose ps | grep -q "Up"; then
            break
        fi
        echo "Waiting for services... ($i/30)"
        sleep 10
    done
    
    # Verify services are running
    if ! docker-compose ps | grep -q "Up"; then
        print_error "Services failed to start properly"
        print_status "Checking logs..."
        docker-compose logs --tail=50
    else
        print_success "Services started successfully"
    fi
fi

# Setup log rotation
print_status "Setting up log rotation..."
sudo tee "/etc/logrotate.d/${PROJECT_NAME}" >/dev/null <<EOF
${PROJECT_DIR}/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 ${USER} ${USER}
    postrotate
        docker-compose restart nginx 2>/dev/null || true
    endscript
}
EOF

# Setup monitoring script
print_status "Setting up monitoring..."
cat >monitor.sh <<'MONITOR_EOF'
#!/bin/bash

CURRENT_USER=$(whoami)
PROJECT_DIR="/home/${CURRENT_USER}/vibrate-monitoring-system"
cd "${PROJECT_DIR}"

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    echo "$(date): Services down, attempting restart..." >> logs/monitor.log
    docker-compose up -d
fi

# Check disk space
DISK_USAGE=$(df / | grep -vE '^Filesystem|tmpfs|cdrom' | awk '{print $5}' | sed 's/%//g')
if [ "${DISK_USAGE}" -gt 85 ]; then
    echo "$(date): Disk usage is ${DISK_USAGE}%" >> logs/monitor.log
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')
if [ "${MEMORY_USAGE}" -gt 85 ]; then
    echo "$(date): Memory usage is ${MEMORY_USAGE}%" >> logs/monitor.log
fi
MONITOR_EOF

chmod +x monitor.sh

# Setup cron jobs
print_status "Setting up cron jobs..."
(crontab -l 2>/dev/null; echo "*/5 * * * * ${PROJECT_DIR}/monitor.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * * docker system prune -f") | crontab -

# Setup backup script
print_status "Setting up backup system..."
cat >backup.sh <<'BACKUP_EOF'
#!/bin/bash

CURRENT_USER=$(whoami)
BACKUP_DIR="/home/${CURRENT_USER}/backups"
PROJECT_DIR="/home/${CURRENT_USER}/vibrate-monitoring-system"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

# Backup project files
tar -czf "${BACKUP_DIR}/project_${DATE}.tar.gz" -C "${PROJECT_DIR}" --exclude=node_modules --exclude=.git .

# Keep only last 7 days of backups
find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +7 -delete

echo "$(date): Backup completed" >> "${PROJECT_DIR}/logs/backup.log"
BACKUP_EOF

chmod +x backup.sh

# Schedule daily backup
(crontab -l 2>/dev/null; echo "0 3 * * * ${PROJECT_DIR}/backup.sh") | crontab -

# Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/vibrate-monitor.service >/dev/null <<EOF
[Unit]
Description=Vibrate Monitoring System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
User=${USER}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable vibrate-monitor.service
print_success "Systemd service created"

# Performance tuning
print_status "Applying performance optimizations..."

# Docker daemon optimization
sudo tee /etc/docker/daemon.json >/dev/null <<'DOCKER_EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2"
}
DOCKER_EOF

sudo systemctl restart docker

# System optimization
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'net.core.rmem_max=16777216' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max=16777216' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Security hardening
print_status "Applying security hardening..."

# Setup automatic security updates
sudo apt install -y unattended-upgrades
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades

# Final health check
print_status "Performing final health check..."
sleep 10

# Display access information
print_success "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
echo
echo "🌐 Your Vibrate Monitoring System is now running!"
echo
print_status "Access Information:"
if echo "${DOMAIN}" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' >/dev/null; then
    echo "   🔗 URL: http://${DOMAIN}"
else
    echo "   🔗 URL: https://${DOMAIN}"
fi
echo "   👤 Super Admin Email: ${EMAIL}"
echo "   🔑 Super Admin Password: ${SUPER_ADMIN_PASSWORD}"
echo
print_status "Database Information:"
echo "   📦 CouchDB Admin Password: ${DB_PASSWORD}"
echo "   🔐 JWT Secret: ${JWT_SECRET:0:20}..."
echo
print_status "Important Files:"
echo "   📁 Project Directory: ${PROJECT_DIR}"
echo "   ⚙️  Environment File: ${PROJECT_DIR}/.env"
echo "   📊 Logs Directory: ${PROJECT_DIR}/logs"
echo "   💾 Backup Directory: /home/${USER}/backups"
echo
print_status "Management Commands:"
echo "   🔄 Restart Services: cd ${PROJECT_DIR} && docker-compose restart"
echo "   📊 View Logs: cd ${PROJECT_DIR} && docker-compose logs -f"
echo "   🛑 Stop Services: cd ${PROJECT_DIR} && docker-compose down"
echo "   ▶️  Start Services: cd ${PROJECT_DIR} && docker-compose up -d"
echo "   🔍 Check Status: cd ${PROJECT_DIR} && docker-compose ps"
echo
print_warning "IMPORTANT: Save the admin credentials shown above!"
print_warning "Change the super admin password after first login!"
echo
print_success "Setup completed successfully! 🎉"

# Save deployment info
cat >deployment-info.txt <<EOF
Vibrate Monitoring System - Deployment Information
================================================

Deployed on: $(date)
Domain: ${DOMAIN}
Super Admin Email: ${EMAIL}
Super Admin Password: ${SUPER_ADMIN_PASSWORD}
Database Password: ${DB_PASSWORD}

Project Directory: ${PROJECT_DIR}
Backup Directory: /home/${USER}/backups

Management Commands:
- Restart: docker-compose restart
- Logs: docker-compose logs -f
- Status: docker-compose ps
- Stop: docker-compose down
- Start: docker-compose up -d
EOF

print_success "Deployment information saved to: ${PROJECT_DIR}/deployment-info.txt"

print_success "Thank you for using Vibrate Monitoring System! 🎉"
