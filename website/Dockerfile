# Website marketing (Vite + React) → Nginx
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_SITE_URL=https://formely.org
ARG VITE_APP_URL=https://academy.formely.org
ARG VITE_API_URL=https://api.formely.org
ARG VITE_LEGAL_NAME=
ARG VITE_LEGAL_ADDRESS=

ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_API_URL=$VITE_API_URL \
    VITE_LEGAL_NAME=$VITE_LEGAL_NAME \
    VITE_LEGAL_ADDRESS=$VITE_LEGAL_ADDRESS

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
