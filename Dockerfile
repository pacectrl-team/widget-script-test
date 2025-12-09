# syntax=docker/dockerfile:1

# Stage 1: build the widget bundle
FROM node:20-slim AS widget-builder
WORKDIR /app/widget

# Install dependencies and build widget
COPY widget/package.json ./
RUN npm install
COPY widget/ ./
RUN npm run build

# Stage 2: build the backend image
FROM python:3.12-slim AS backend
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source and built widget
COPY backend/ ./backend/
COPY --from=widget-builder /app/widget/dist ./widget/dist

EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
