const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true
  },
  preferences: {
    textSize: {
      type: String,
      default: "medium"
    },
    darkMode: {
      type: Boolean,
      default: false
    }
  }
});

module.exports = mongoose.model("User", UserSchema);
