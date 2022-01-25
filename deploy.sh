#!/bin/bash
PROJECT_NAME="virtualriskspace"
IMAGE_NAME="eu.gcr.io/$PROJECT_NAME/vrs-fileupload-test"
docker build . --tag $IMAGE_NAME
docker push $IMAGE_NAME
gcloud run deploy "vrs-fileupload-test" --image=$IMAGE_NAME:latest --min-instances=0 --max-instances=4 --region=europe-west4 --timeout=300 --cpu=4 --memory=4Gi --concurrency=10 --platform=managed --allow-unauthenticated