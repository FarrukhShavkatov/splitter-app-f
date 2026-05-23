// run this script to print the local IP addresses for Expo Go
// then add the IP address to the frontend .env file as EXPO_PUBLIC_API_URL
// write ```node print-ip.cjs``` to run the script

const os = require("os");

const interfaces = os.networkInterfaces();
const addresses = [];

for (const [name, values] of Object.entries(interfaces)) {
  for (const item of values || []) {
    if (item.family === "IPv4" && !item.internal) {
      addresses.push({ name, address: item.address });
    }
  }
}

if (addresses.length === 0) {
  console.log("No local IPv4 address found. Check Wi-Fi/Ethernet connection.");
  process.exit(0);
}

console.log("Local IP addresses for Expo Go:");
for (const item of addresses) {
  console.log(`- ${item.address} (${item.name}) -> EXPO_PUBLIC_API_URL=http://${item.address}:8080`);
}