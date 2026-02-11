const express = require("express");
const router = express.Router();
const { getNews, addNews } = require("../controllers/news.controller");

router.get("/", getNews);
router.post("/add", addNews); // temporary admin

module.exports = router;
