# Racing Data Analysis Web Application
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static web application files
COPY index.html styles.css /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

# Copy entrypoint for runtime config injection
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Default API URLs (overridable via environment variables at runtime)
ENV API_BASE_URL=http://localhost:8000
ENV SIMULATION_BASE_URL=http://localhost:8002

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
