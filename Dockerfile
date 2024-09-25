FROM node
RUN which curl || apt-get update && apt-get install -y curl
WORKDIR /app/
COPY package.json package-lock.json /app/
RUN npm install
COPY src /app/src/
CMD ["node", "src/index.js"]
