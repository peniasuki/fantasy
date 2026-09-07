#!/usr/bin/env bash
set -euo pipefail
PROJECT=fantasy-507821
REGION=europe-west1

gcloud config set project "$PROJECT"
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  identitytoolkit.googleapis.com

gcloud firestore databases create --location=eur3 --type=firestore-native --project="$PROJECT" || true

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env.local
  set +a
fi

if [[ -n "${API_FOOTBALL_KEY:-}" ]]; then
  printf '%s' "$API_FOOTBALL_KEY" | gcloud secrets create api-football-key --data-file=- --project="$PROJECT" 2>/dev/null \
    || printf '%s' "$API_FOOTBALL_KEY" | gcloud secrets versions add api-football-key --data-file=- --project="$PROJECT"
fi

echo "Siguiente: activa Firebase Auth (Google) en https://console.firebase.google.com/project/$PROJECT/authentication"
echo "y pega NEXT_PUBLIC_FIREBASE_API_KEY y NEXT_PUBLIC_FIREBASE_APP_ID en .env.local"
