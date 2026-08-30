const { getDB } = require("../config/db");

const updateProfile = async (req, res) => {
  const {
    email,
    name,
    image,
    bio,
    skills,
  } = req.body;

  if (!email?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  await getDB().collection("user").updateOne(
    {
      email: email.trim(),
    },
    {
      $set: {
        ...(name && { name: name.trim() }),
        ...(image && { image }),
        ...(bio && { bio: bio.trim() }),
        ...(skills && { skills }),
        updatedAt: new Date(),
      },
    },
    {
      upsert: true,
    },
  );

  res.json({
    success: true,
    message: "Profile updated successfully",
  });
};

module.exports = {
  updateProfile,
};