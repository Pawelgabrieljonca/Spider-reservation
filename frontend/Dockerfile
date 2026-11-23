# --- Etap 1: budowanie produkcyjnej paczki Vite ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Adresy publiczne dla przeglądarki użytkownika (wstrzykiwane w czasie budowania Vite)
ARG VITE_API_URL=http://localhost:5001
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=spider-climbing
ARG VITE_KEYCLOAK_CLIENT_ID=spider-frontend

ENV VITE_API_URL=$VITE_API_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

RUN npm run build

# --- Etap 2: lekki serwer Nginx serwujący statyczne SPA ---
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
