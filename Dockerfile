FROM node:16-buster AS base

RUN mkdir /app

ADD package.json /app
ADD package-lock.json /app

WORKDIR /app

RUN npm install

ADD src/ /app/src


