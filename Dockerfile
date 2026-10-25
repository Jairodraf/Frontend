# 1. Fase de Compilación
FROM node:20-alpine AS build
WORKDIR /app

# Copiar manifiestos y descargar dependencias
COPY package*.json ./
RUN npm ci

# Copiar el código fuente y compilar para producción
COPY . .
RUN npm run build -- --configuration production

# 2. Fase de Ejecución con Nginx
FROM nginx:alpine

# Si en tu dist se genera una subcarpeta /browser (Angular 17+), usa esta línea:
COPY --from=build /app/dist/*/browser /usr/share/nginx/html

# Si tu compilación deja los archivos directamente en dist/nombre-proyecto (sin /browser),
# usa en su lugar:
# COPY --from=build /app/dist/* /usr/share/nginx/html

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]