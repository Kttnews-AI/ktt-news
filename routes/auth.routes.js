const express = require("express");
const router = express.Router();
const { verifyOtp } = require("../controllers/auth.controller");

router.post("/verify", verifyOtp);

module.exports = router;
