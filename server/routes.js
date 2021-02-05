const bodyParser = require("body-parser");
const helmet = require("helmet");
const express = require("express");
const compression = require("compression");
const zlib = require("zlib");
const cors = require("cors");

const { HashtagRoutes } = require("./api/hashtag/routes");
const { UserRoutes } = require("./api/user/routes");
const { DenyListRoutes } = require("./api/deny_list/routes");
const { PostRoutes } = require("./api/post/routes");
const { ManifestationRoutes } = require("./api/manifestation/routes");

class RoutesConfig {
  static init(app, router) {
    app.use(
      compression({
        level: zlib.Z_BEST_COMPRESSION,
        threshold: "2kb",
      }),
    );
    app.options("*", cors());
    app.use(cors());
    app.use(express.static(`${process.cwd()}/node_modules/`));
    app.use(bodyParser.json());
    app.use(helmet());

    HashtagRoutes.init(router);
    UserRoutes.init(router);
    DenyListRoutes.init(router);
    PostRoutes.init(router);
    ManifestationRoutes.init(router);

    app.use("/api", router);
  }
}

module.exports = { RoutesConfig };
