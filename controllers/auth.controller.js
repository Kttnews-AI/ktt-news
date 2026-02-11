const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.verifyOtp = async (req, res) => {
  try {
    console.log("🔥 VERIFY API HIT");
    console.log("🔥 BODY:", req.body);

    const { phone, otp } = req.body;

    if (!phone) {
      console.log("❌ PHONE MISSING");
      return res.status(400).json({ success: false });
    }

    if (otp !== "1234") {
      console.log("❌ OTP WRONG:", otp);
      return res.status(401).json({ success: false });
    }

    let user = await User.findOne({ phone });
    console.log("🔎 USER FOUND:", user);

    if (!user) {
      console.log("🆕 CREATING USER:", phone);
      user = await User.create({ phone });
    }

    console.log("✅ USER SAVED:", user);

    const token = jwt.sign(
      { userId: user._id },
      "secret123",
      { expiresIn: "7d" }
    );

    res.json({ success: true, token });

  } catch (err) {
    console.error("🔥 AUTH ERROR:", err);
    res.status(500).json({ success: false });
  }
};
