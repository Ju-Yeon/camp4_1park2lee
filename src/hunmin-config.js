let path = require('path');
let NODE_ENV = "development";

module.exports = {
    NODE_ENV: NODE_ENV,
    IP: (NODE_ENV === "development") ? "localhost" : "34.219.138.15",
    AUTH_PORT: (NODE_ENV === "development") ? 3300 : 3300,
    CHAT_PORT: (NODE_ENV === "development") ? 3000 : 3000,
    SPELL_PORT: (NODE_ENV === "development") ? 3100 : 3100,
    AUTH_URL: (NODE_ENV === "development") ? "localhost:3300" : "34.219.138.15:3300",
    CHAT_URL: (NODE_ENV === "development") ? "localhost:3000" : "34.219.138.15:3000",
    SPELL_URL: (NODE_ENV === "development") ? "localhost:3100" : "34.219.138.15:3100",
    CONFIG_PATH: path.join(__dirname, '../config/'),
    IMAGES_PATH: path.join(__dirname, '../data/images')
};