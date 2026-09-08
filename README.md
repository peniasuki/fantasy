# FANTASY

Liga privada tipo Biwenger (modo Normal). Next.js en Cloud Run.
Puntos desde Jornada Perfecta (media AS / SofaScore, `puntuacion=16`).

## Secretos

`JOBS_SHARED_SECRET` vive en `.env.local` (gitignored) y en Secret Manager. No lo subas al repo.

## Local

```bash
gcloud config set project fantasy-507821
gcloud auth application-default login
npm install
npm run dev
```

Hace falta Firebase Auth en el mismo proyecto (`fantasy-507821`): Authentication → Google, y las claves web en `.env.local`.

## GCP

```bash
chmod +x scripts/bootstrap-gcp.sh
./scripts/bootstrap-gcp.sh
```

Deploy: Cloud Build (`cloudbuild.yaml`) + Cloud Run service `fantasy`.
