const _ = require("lodash");
const assert = require("assert");
const formidable = require("formidable");
const pify = require("pify");

const { ManifestationDAO, UserDAO } = require("mv-models");

const { normalizeAndLogError, NotFoundError } = require("../../helpers/errors");

class ManifestationController {
  async create(req, res, next) {
    try {
      console.log("create");
      const manifestation = req.body;
      const userId = manifestation.user;
      const users = [];
      delete manifestation.user;
      assert(_.isObject(manifestation), "Manifestation is not a valid object.");
      for (const i in userId) {
        const user = await UserDAO.getById(userId[i]);
        if (!user) {
          throw new NotFoundError(404, `User not found with id ${userId}`);
        }
        if (user.superadmin) {
          throw new NotFoundError(
            404,
            `User ${user.name} is not eligible for this manifestation, please select other`,
          );
        }
        users.push(user);
      }
      const newManifestation = await ManifestationDAO.createNew(manifestation);
      for (const i in users) {
        const user = users[i];
        user.manifestation_id = newManifestation._id;
        await UserDAO.udpate(user._id, user);
      }
      res.status(201).json(newManifestation);
    } catch (error) {
      const throwable = normalizeAndLogError("Manifestation", req, error);
      next(throwable);
    }
  }

  async getAll(req, res, next) {
    try {
      const { shapedQuery } = req;
      const manifestation = await ManifestationDAO.getAll(shapedQuery);
      res.status(200).json({
        data: manifestation.list,
        total: manifestation.total,
      });
    } catch (error) {
      const throwable = normalizeAndLogError("Manifestation", req, error);
      next(throwable);
    }
  }

  async delete(req, res, next) {
    try {
      const manifestationDeleted = await ManifestationDAO.delete(
        { _id: req.params.manifestationId },
        req.user._id,
      );
      if (!manifestationDeleted) {
        throw new NotFoundError(
          404,
          `Manifestation not found with id ${req.params.manifestationId}`,
        );
      }
      res.status(200).json(manifestationDeleted);
    } catch (err) {
      const throwable = normalizeAndLogError("Manifestation", req, err);
      next(throwable);
    }
  }

  async getOne(req, res, next) {
    try {
      const manifestation = await ManifestationDAO.getById(req.params.manifestationId);
      if (!manifestation) {
        throw new NotFoundError(
          404,
          `Manifestation not found with id ${req.params.manifestationId}`,
        );
      }
      res.status(200).json(manifestation);
    } catch (error) {
      const throwable = normalizeAndLogError("Manifestation", req, error);
      next(throwable);
    }
  }

  async assingUsers(res, reqUser, manifestation, usersId, updatedManifestation) {
    if (reqUser.superadmin) {
      // remove manifestations from all users that have it
      const usersWithThisManifestation = await UserDAO.find({
        manifestation_id: manifestation.id,
      });
      for (const i in usersWithThisManifestation) {
        const user = usersWithThisManifestation[i];
        user.manifestation_id = null;
        await UserDAO.udpate(user._id, user);
      }
      // re assigns users selected
      for (const i in usersId) {
        const user = await UserDAO.getById(usersId[i]);
        if (!user) {
          throw new NotFoundError(404, `User not found with id ${usersId[i]}`);
        }
        user.manifestation_id = updatedManifestation._id;
        await UserDAO.udpate(user._id, user);
      }
    }
  }

  async parseFieldToArrayElement(object, key, value) {
    const keys = key.split(".");
    if (object[keys[0]][parseInt(keys[1])]) {
      object[keys[0]][parseInt(keys[1])][keys[2]] = value;
    } else {
      const newObject = {};
      newObject[keys[2]] = value;
      object[keys[0]].push(newObject);
    }
    console.log("PARSE", { key, value });
    console.log("object", object);
  }

  async resolveAsForm(req, res) {
    const form = formidable({ multiples: true });
    const asyncParse = await pify(form.parse, { multiArgs: true }).bind(form);
    // const asyncParse = util.promisify(form.parse).bind(form);
    const [fields, files] = await asyncParse(req);
    delete fields.id;
    const arrayValues = { sponsors: [], hashtags: [] };
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    for (let i = 0; i < keys.length; i++) {
      // ignores data images, sponsors and hashtags.
      if (
        !keys[i].includes("images") &&
        !keys[i].includes("sponsors") &&
        !keys[i].includes("hashtags")
      ) {
        const value = values[i];
        const vquery = {};
        vquery[keys[i]] = value;
        await ManifestationDAO.udpate(req.params.manifestationId, vquery);
      } else {
        // Parse fields like sponsors.0.name to array element.
        if (keys[i].includes("sponsors") || keys[i].includes("hashtags")) {
          new ManifestationController().parseFieldToArrayElement(arrayValues, keys[i], values[i]);
        }
      }
    }
    await ManifestationDAO.udpate(req.params.manifestationId, arrayValues);

    // image file save
    console.log(files);
    // foreach(files, (file) => const url = files.saveS3();
    //   manifestaion.loqueva.url = url
    // );
    const filesKeys = Object.keys(files);
    const filesValues = Object.values(files);
    for (let i = 0; i < filesKeys.length; i++) {
      const query = {};
      // urlfile = filesValues[i].saveS3();

      /* Solo estoy usando el nombre del campo del field que viene como image.header.rawFile
      para pasarlo a image.header.src y aprobechar el la notación dot para guardar el url. */
      const key = filesKeys[i].replace("rawFile", "src");
      // vquery[key] = urlfile;
      query[key] = "https://www.instasent.com/blog/wp-content/uploads/2019/09/5a144f339cc68-1.png";
      await ManifestationDAO.udpate(req.params.manifestationId, query);
    }
    const updatedManifestation = await ManifestationDAO.getById(req.params.manifestationId);
    res.status(201).json(updatedManifestation);
  }

  async resolveAsJson(req, res) {
    let manifestation = req.body;
    console.log("resolve as json");
    assert(_.isObject(manifestation), "Manifestation is not a valid object.");
    const usersId = manifestation.users_id;
    delete manifestation.users_id;
    // cuts data for update when admin edits.
    if (req.user.superadmin) {
      manifestation = {
        id: manifestation.id,
        name: manifestation.name,
        uri: manifestation.uri,
      };
    }
    const updatedManifestation = await ManifestationDAO.udpate(manifestation.id, manifestation);
    new ManifestationController().assingUsers(
      res,
      req.user,
      manifestation,
      usersId,
      updatedManifestation,
    );
    res.status(201).json(updatedManifestation);
  }

  async update(req, res, next) {
    try {
      _.isEmpty(req.body)
        ? await new ManifestationController().resolveAsForm(req, res)
        : await new ManifestationController().resolveAsJson(req, res);
    } catch (error) {
      const throwable = normalizeAndLogError("Manifestation", req, error);
      next(throwable);
    }
  }
}

module.exports = { ManifestationController };
