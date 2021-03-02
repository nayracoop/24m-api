const _ = require("lodash");
const { UserDAO } = require("mv-models");
const path = require("path");
const config = require("config");
const shorthash = require("shorthash2");
const pify = require("pify");
const mv = require("mv");

const s3Service = require("../../common/s3");
const seaweedHelper = require("../../helpers/seaweed");
const { NotFoundError, PermissionError } = require("../../helpers/errors");

function cleanupStructure(manifestation) {
  const keys = Object.keys(manifestation);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].includes("id")) {
      delete manifestation[keys[i]];
    }
  }
}

function parseFieldToArrayElement(object, key, value) {
  const keys = key.split(".");
  if (object[keys[0]][parseInt(keys[1])]) {
    object[keys[0]][parseInt(keys[1])][keys[2]] = value;
  } else {
    const newObject = {};
    newObject[keys[2]] = value;
    object[keys[0]].push(newObject);
  }
}

function processArrayFields(manifestation) {
  const arrayValues = { sponsors: [], hashtags: [] };
  const keys = Object.keys(manifestation);
  const values = Object.values(manifestation);

  for (let i = 0; i < keys.length; i++) {
    // ignores data of sponsors and hashtags.
    if (!keys[i].includes("sponsors") && !keys[i].includes("hashtags")) {
      const value = values[i];
      const vquery = {};
      vquery[keys[i]] = value;
      // await ManifestationDAO.udpate(req.params.manifestationId, vquery);
    } else {
      // Parse fields like sponsors.0.name to array element.
      parseFieldToArrayElement(arrayValues, keys[i], values[i]);
    }
  }
}

async function assingUsers(manifestation) {
  const usersId = manifestation.userIds;
  delete manifestation.userIds;
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
    user.manifestation_id = manifestation.id;
    await UserDAO.udpate(user._id, user);
  }
}

function validateOwnership({ id, name }, { superadmin, manifestation_id: manifestationId }) {
  if (!superadmin && (!manifestationId || id.toString() !== manifestationId.toString())) {
    throw new PermissionError(403, `No tiene permisos de edición para la manifestación ${name}`);
  }
}

async function processFiles(manifestation, files) {
  const s3 = s3Service.getInstance();

  // TODO: check for multifiles upload
  // and iterate over the results
  for (const file in files) {
    let uploadResults;
    const renamedFile = file.toString().replace("rawFile", "src");
    let src;
    try {
      uploadResults = await s3.client.write(files[file].path);
      src = seaweedHelper.parseResultsToSrc(uploadResults);
    } catch (error) {
      // if the file server is down
      // move to local public static served folder
      // and use that as source
      if (!error.message || !error.message.includes("ECONNREFUSED")) {
        throw error;
      }
      const fileName = `${shorthash(files[file].name)}${path.extname(files[file].name)}`;
      await pify(mv)(files[file].path, path.join(__dirname, "../..", "public", fileName));
      src = `${config.get("api.public")}/pubresources/${fileName}`;
    }

    _.set(manifestation, renamedFile, src);
  }
}

module.exports = {
  assingUsers,
  validateOwnership,
  processArrayFields,
  processFiles,
  cleanupStructure,
};
