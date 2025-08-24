FROM node
WORKDIR /main
COPY package.json /main
RUN npm install
COPY . /main
CMD ["node","main.js"]