/**
 * Cesium Ion access token is read from process.env.CESIUM_ION_ACCESS_TOKEN only.
 * Set CESIUM_ION_ACCESS_TOKEN in `.env` (overrides committed `env`) or in Heroku Config Vars.
 * https://ion.cesium.com/tokens
 */
module.exports = { accessToken: "" };
