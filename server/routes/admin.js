const express = require("express");
const { checkAdminPassword, issueAdminToken } = require("../auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  res.json({ token: issueAdminToken() });
});

module.exports = router;
