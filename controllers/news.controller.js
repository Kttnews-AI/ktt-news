const News = require("../models/news");

// GET all news
exports.getNews = async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    console.error("Get news error:", err);
    res.status(500).json({ success: false });
  }
};

// ADD news
exports.addNews = async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content required"
      });
    }

    const news = await News.create({ title, content });

    res.json(news);
  } catch (err) {
    console.error("Add news error:", err);
    res.status(500).json({ success: false });
  }
};
