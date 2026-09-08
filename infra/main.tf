terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type    = string
  default = "fantasy-507821"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "jobs_secret" {
  type      = string
  sensitive = true
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iamcredentials.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = "eur3"
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

resource "google_secret_manager_secret" "jobs" {
  secret_id = "jobs-shared-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jobs" {
  secret      = google_secret_manager_secret.jobs.id
  secret_data = var.jobs_secret
}

resource "google_cloud_run_v2_service" "app" {
  name     = "fantasy"
  location = var.region
  depends_on = [google_project_service.apis]

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name = "JOBS_SHARED_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jobs.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

variable "image" {
  type    = string
  default = "europe-west1-docker.pkg.dev/fantasy-507821/fantasy/app:latest"
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_scheduler_job" "market" {
  name      = "settle-market"
  schedule  = "0 7 * * *"
  time_zone = "Europe/Madrid"
  http_target {
    uri         = "${google_cloud_run_v2_service.app.uri}/api/jobs/settle-market"
    http_method = "POST"
    headers     = { "x-jobs-secret" = var.jobs_secret }
  }
  depends_on = [google_project_service.apis]
}

# Víspera de jornada: el job solo aplica si hoy (Madrid) coincide con lockAt del calendario maestro.
resource "google_cloud_scheduler_job" "jp_availability" {
  name      = "sync-jp-availability"
  schedule  = "0 23 * * *"
  time_zone = "Europe/Madrid"
  http_target {
    uri         = "${google_cloud_run_v2_service.app.uri}/api/jobs/sync-jp-availability"
    http_method = "POST"
    headers     = { "x-jobs-secret" = var.jobs_secret }
  }
  depends_on = [google_project_service.apis]
}

output "service_url" {
  value = google_cloud_run_v2_service.app.uri
}
