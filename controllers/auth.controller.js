const authService = require("../services/auth.service");
const sessionFlash = require("../util/session-flash");
const authUtil = require("../util/authentication");

function getLogin(req, res) {
  const inputData = sessionFlash.getSessionData(req) || { email: "", errorMessage: "" };
  res.render("auth/login", { inputData });
}

function getSignup(req, res) {
  const sessionData = sessionFlash.getSessionData(req) || {
    email: "",
    confirmPassword: "",
    errorMessage: "",
  };
  res.render("auth/signup", { sessionData });
}

async function signup(req, res, next) {
  const email = req.body.email || "";
  const password = req.body.password || "";
  const confirmPassword = req.body["confirm-password"] || "";

  if (!authService.signupInputValid(email, password, confirmPassword)) {
    return sessionFlash.flashDataToSession(
      req,
      { email, confirmPassword, errorMessage: "Please check your input values." },
      () => res.redirect("/signup")
    );
  }

  try {
    const result = await authService.signup(email, password);
    if (!result.ok) {
      return sessionFlash.flashDataToSession(
        req,
        { email, confirmPassword, errorMessage: result.message },
        () => res.redirect("/signup")
      );
    }
    res.redirect("/login");
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  const email = req.body.email || "";
  const password = req.body.password || "";

  try {
    const result = await authService.login(email, password);
    if (!result.ok) {
      return sessionFlash.flashDataToSession(
        req,
        { email, errorMessage: result.message },
        () => res.redirect("/login")
      );
    }
    authUtil.createUserSession(req, result.user, () => res.redirect("/tracker"));
  } catch (error) {
    next(error);
  }
}

function logout(req, res) {
  authUtil.destroyUserSession(req, () => res.redirect("/"));
}

module.exports = { getLogin, getSignup, signup, login, logout };
