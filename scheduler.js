const cron = require("node-cron");
const OpenAI = require("openai");
const News = require("./models/News");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateAINews() {
  try {
    console.log("🔄 Generating AI news...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content:
            "Generate 5 short Indian technology news in JSON format like this: [{\"title\":\"\",\"content\":\"\"}]"
        }
      ],
    });

    const text = response.choices[0].message.content;

    const newsArray = JSON.parse(text);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59);

    await News.deleteMany({});

    for (let item of newsArray) {
      await News.create({
        title: item.title,
        content: item.content,
        expiresAt: endOfDay,
      });
    }

    console.log("✅ AI News Uploaded Successfully");

  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

// 🔥 IMPORTANT: Render uses UTC
// 8:00 AM IST = 2:30 AM UTC
cron.schedule("*/1 * * * *", async () => {
  console.log("⏰ Running Daily Automation...");
  await generateAINews();
});
