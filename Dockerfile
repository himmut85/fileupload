
FROM node:14
WORKDIR /app
COPY . /app
RUN npm install
WORKDIR /app/app
RUN npm install
RUN node node_modules/@quasar/app/bin/quasar-build
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
#ENV GOOGLE_APPLICATION_CREDENTIALS=./google-storage-api.json

EXPOSE 8080

CMD ["node", "bin/www"]
