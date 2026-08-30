const startupLookup = [
  {
    $set: {
      startupObjectId: {
        $convert: {
          input: "$startup_id",
          to: "objectId",
          onError: null,
          onNull: null,
        },
      },
    },
  },

  {
    $lookup: {
      from: "startup",
      localField: "startupObjectId",
      foreignField: "_id",
      as: "startupData",
    },
  },

  {
    $set: {
      startup_details: {
        $arrayElemAt: ["$startupData", 0],
      },
    },
  },

  {
    $project: {
      startupObjectId: 0,
      startupData: 0,
    },
  },
];

module.exports = startupLookup;