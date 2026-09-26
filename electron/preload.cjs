const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("bricksMap", {
  platform: process.platform,
});
