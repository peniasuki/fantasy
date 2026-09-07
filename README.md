# FANTASY

Liga privada tipo Biwenger (modo Normal, sistema Estadísticas). Next.js en Cloud Run. Puntos solo al finalizar el partido.

## Secretos

La API key de API-Football vive en `.env.local` (gitignored) y en Secret Manager. No la subas al repo.

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

Deploy de la imagen a Artifact Registry + Cloud Run (Terraform en `infra/`).

## Cuota API-Football (Free)

Importa plantillas en tandas desde Admin (`maxTeams=5`). Calendario = 1 request. Puntuar jornada ≈ 10 requests post-FT.
