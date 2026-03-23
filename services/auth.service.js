const User = require("../models/user.model");

function signupInputValid(email, password, confirmPassword) {
  return (
    email &&
    email.includes("@") &&
    password &&
    password.trim().length >= 6 &&
    confirmPassword &&
    password === confirmPassword
  );
}

function generateRandomDisplayName() {
  const randomPart = `${Math.floor(100000000 + Math.random() * 900000000)}${Date.now().toString().slice(-6)}`;
  return `user-${randomPart}`;
}

async function signup(email, password) {
  const displayName = generateRandomDisplayName();
  const user = new User(email, password, displayName);
  const exists = await user.exists();
  if (exists) return { ok: false, message: "This email is already registered." };
  await user.create();
  return { ok: true };
}

async function login(email, password) {
  const user = new User(email, password);
  const existing = await user.getByEmail();
  if (!existing) return { ok: false, message: "Invalid email or password." };
  const matched = await user.hasMatchingPassword(existing.password);
  if (!matched) return { ok: false, message: "Invalid email or password." };
  return { ok: true, user: existing };
}

module.exports = { signupInputValid, signup, login };
