It is instruction for quick start with npm and docker

At first at your bash terminal(if you use windows open git bash terminal) create env file from env.example
in two directory(frontend and backend) use this comand
```
cp .env.example .env
```

In frontend .env write your ip like this
EXPO_PUBLIC_API_URL=http://writeYourIP:8080
change your ip every time when you connect to 

run print-ip scripts to know your ip
```
npm run ip
```
or
```
node print-ip.cjs
```

In frontend directory install npm packages with
```
npm install
```

In backend directory build and run docker container with
```
docker compose up --build
```
for first start or if you change code or settings
or
```
docker compose up
```
after building container without changing code or settings

After installing in frontend run
```
npm start
```

You can see QR code, scan this QR with Expo Go application in your smartphone
Before that you must install Expo Go from Play Market or App Store

After scaning in frontend terminal you see Expo Go logging, choose Proceed anonymously(you see it every time when you scan QR for using this project via Expo Go)