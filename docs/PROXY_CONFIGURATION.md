# Configuration Reverse Proxy

Ce document explique comment configurer le serveur MCP Backlog pour fonctionner derrière un reverse proxy nginx et prendre en compte les en-têtes X-Forwarded-For.

## Configuration du serveur MCP

### Variables d'environnement

Ajoutez ces variables à votre fichier `.env` :

```bash
# Configuration du proxy
TRUST_PROXY=true
TRUSTED_PROXIES=192.168.1.100,10.0.0.1
PROXY_HOPS=1
```

#### Variables disponibles :

- **TRUST_PROXY** : `true` pour activer la prise en compte des proxies, `false` pour les connexions directes
- **TRUSTED_PROXIES** : Liste des IPs des proxies de confiance séparées par des virgules (optionnel)
- **PROXY_HOPS** : Nombre maximum de proxies à traverser (défaut: 1)

### Modes de configuration

#### 1. Proxies spécifiques (recommandé pour la production)

```bash
TRUST_PROXY=true
TRUSTED_PROXIES=192.168.1.100,10.0.0.1
PROXY_HOPS=1
```

#### 2. Tous les proxies (non recommandé pour la production)

```bash
TRUST_PROXY=true
TRUSTED_PROXIES=
PROXY_HOPS=1
```

#### 3. Connexions directes (pas de proxy)

```bash
TRUST_PROXY=false
```

## Configuration nginx

### Configuration de base

```nginx
upstream mcp_backend {
    server 127.0.0.1:3000;
    # Ajoutez d'autres serveurs pour la haute disponibilité
    # server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name votre-domaine.com;

    # Redirection HTTPS (recommandé)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # Configuration SSL
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    # En-têtes de sécurité
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Configuration du proxy
    location /backlog-mcp/ {
        proxy_pass http://mcp_backend/backlog-mcp/;

        # En-têtes essentiels pour le proxy
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # Configuration pour les WebSockets (si nécessaire)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffers
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;

        # Logs
        access_log /var/log/nginx/mcp_access.log;
        error_log /var/log/nginx/mcp_error.log;
    }

    # Health check endpoint
    location /backlog-mcp/health {
        proxy_pass http://mcp_backend/backlog-mcp/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cache pour le health check
        proxy_cache_valid 200 1m;
    }
}
```

### Configuration avancée avec rate limiting

```nginx
# Zone de rate limiting
limit_req_zone $binary_remote_addr zone=mcp_api:10m rate=10r/s;

server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # ... configuration SSL ...

    location /backlog-mcp/ {
        # Rate limiting
        limit_req zone=mcp_api burst=20 nodelay;

        # Filtrage par IP (optionnel)
        # allow 192.168.1.0/24;
        # deny all;

        proxy_pass http://mcp_backend/backlog-mcp/;

        # En-têtes proxy
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # Configuration pour les gros payloads
        client_max_body_size 10M;

        # Logs détaillés
        access_log /var/log/nginx/mcp_access.log combined;
        error_log /var/log/nginx/mcp_error.log warn;
    }
}
```

## En-têtes supportés

Le serveur MCP reconnaît et traite les en-têtes suivants :

- **X-Forwarded-For** : IP réelle du client
- **X-Forwarded-Proto** : Protocole original (http/https)
- **X-Forwarded-Host** : Host original
- **X-Real-IP** : IP réelle (alternative à X-Forwarded-For)
- **CF-Connecting-IP** : IP client Cloudflare
- **X-Client-IP** : IP client générique

## Logging et debugging

### Logs du serveur MCP

Le serveur MCP loggue automatiquement :

- Configuration du proxy au démarrage
- En-têtes de proxy détectés (en mode debug)
- IP réelle du client vs IP du proxy
- Informations de connexion enrichies

### Exemple de log

```json
{
  "level": "info",
  "message": "Incoming Request",
  "requestId": "uuid-here",
  "client": {
    "ip": "203.0.113.1",
    "originalIP": "192.168.1.100",
    "forwardedFor": "203.0.113.1, 198.51.100.1",
    "protocol": "https",
    "host": "votre-domaine.com",
    "behindProxy": true
  }
}
```

## Sécurité

### Bonnes pratiques

1. **Toujours spécifier les IPs des proxies de confiance** en production
2. **Utiliser HTTPS** entre le client et nginx
3. **Configurer des timeouts appropriés**
4. **Implémenter du rate limiting** au niveau nginx
5. **Monitorer les logs** pour détecter les tentatives d'injection d'en-têtes

### Validation des en-têtes

Le serveur MCP valide automatiquement :

- Que les en-têtes X-Forwarded-\* proviennent de proxies de confiance
- La cohérence des informations de proxy
- La prévention de l'injection d'en-têtes malveillants

## Test de la configuration

### 1. Vérifier la configuration nginx

```bash
nginx -t
systemctl reload nginx
```

### 2. Tester la connectivité

```bash
curl -H "Authorization: Bearer your-token" \
     https://votre-domaine.com/backlog-mcp/health
```

### 3. Vérifier les logs

```bash
# Logs nginx
tail -f /var/log/nginx/mcp_access.log

# Logs du serveur MCP
docker logs -f project-backlog-mcp
```

## Dépannage

### Problèmes courants

1. **IP incorrecte dans les logs**

   - Vérifier `TRUST_PROXY=true`
   - Vérifier les `TRUSTED_PROXIES`

2. **Rate limiting incorrect**

   - Le rate limiting utilise automatiquement la vraie IP client

3. **En-têtes manquants**
   - Vérifier la configuration nginx
   - S'assurer que `proxy_set_header X-Forwarded-For` est présent

### Debug

Activer le mode debug :

```bash
NODE_ENV=development
```

Cela affichera les en-têtes de proxy détectés dans les logs.
