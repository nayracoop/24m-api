const http = require("http");
const express = require("express");
const config = require("config");
const MvModels = require("mv-models");

const { RoutesConfig } = require("./routes");
const { CacheConfig } = require("./common/cache");
const { LoggerConfig } = require("./common/logger");
const S3Config = require("./common/s3");
const dbHelper = require("./helpers/db");

const apiPort = config.get("api.port") || 3333;
const apiHost = config.get("api.host") || "localhost";
const dbUri = dbHelper.getDbUri(config);

const app = express();

(async () => {
  try {
    LoggerConfig.init(app);
    RoutesConfig.init(app, express.Router());
    CacheConfig.init();
    S3Config.init("seaweed");

    await MvModels.init(dbUri);
    await http.createServer(app).listen(apiPort, apiHost);
    process.env.NODE_ENV !== "test" &&
      LoggerConfig.getChild("server.js").info(`Server started on ${apiHost}:${apiPort}`);
  } catch (err) {
    LoggerConfig.getChild("server.js").error(err);
  }
})();

module.exports = app;
