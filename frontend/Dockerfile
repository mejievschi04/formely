# Multi-stage build pentru Frontend React + Vite
# Vite 7 necesită Node ^20.19.0 sau >=22.12.0
FROM node:22-alpine AS builder

WORKDIR /app

# Build arg pentru URL API (se bazează în build de Vite)
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL

# Copiază fișierele de dependențe
COPY package*.json ./

# Instalează dependențe
RUN npm ci

# Copiază codul sursă
COPY . .

# Build pentru producție
RUN npm run build

# Stage pentru producție - Nginx
FROM nginx:alpine AS production

# Copiază build-ul din stage-ul builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiază configurația Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expune portul
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
