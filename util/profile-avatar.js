const fs = require("fs");
const path = require("path");

/**
 * Remove a previous avatar file when the user uploads a new one (profile-media or legacy uploads path).
 */
function deletePreviousAvatarIfAny(sessionUid, currentImageUrl) {
  if (!currentImageUrl || typeof currentImageUrl !== "string") return;
  const profilePrefix = `/profile-media/${sessionUid}/`;
  if (currentImageUrl.startsWith(profilePrefix)) {
    const name = path.basename(currentImageUrl.slice(profilePrefix.length));
    if (!name || name === "." || name === "..") return;
    const abs = path.join(__dirname, "..", "data", "users", sessionUid, "profile", name);
    fs.unlink(abs, function () {});
    return;
  }
  if (currentImageUrl.startsWith("/uploads/avatars/")) {
    const abs = path.join(__dirname, "..", currentImageUrl.replace(/^\//, ""));
    fs.unlink(abs, function () {});
  }
}

module.exports = { deletePreviousAvatarIfAny };
