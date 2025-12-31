# Caddy Configuration

Below is a sample Caddyfile that is designed to be ran on a Caddy server.  Be sure and replace all DNS Addresses and IP Addresses to match your enviroment.

For instructions to setup Caddy with Docker Compose, see instructions [here](https://caddyserver.com/docs/running#docker-compose).  Please remember that after making changes to your Caddyfile, the Caddy service must be restarted to take effect.

---

```
auth.your-domain-here.com {  # Your Authentik DNS Address
        reverse_proxy 192.168.1.100:9000 #  # Your Authentik Internal IP Address and Port
}

takportal.your-domain-here.com {  # Your TAK Portal DNS Address
    route {
        reverse_proxy /outpost.goauthentik.io/* http://192.168.1.100:9000  # Your Authentik Internal IP Address and Port

        forward_auth http://192.168.1.100:9000 {  # Your Authentik Internal IP Address and Port
            uri /outpost.goauthentik.io/auth/caddy
            copy_headers X-Authentik-Username X-Authentik-Groups X-Authentik-Entitlements X-Authentik-Email X-Authentik-Name X-Authentik-Uid X-Authentik-Jwt X-Authentik-Meta-Jwks X-Authentik-Meta-Outpost X-Authentik-Meta-Provider X-Authentik-Meta-App X-Authentik-Meta-Version
            trusted_proxies private_ranges
        }

        reverse_proxy 192.168.1.100:3000 # Your TAK Portal Internal IP Address
    }
}

```