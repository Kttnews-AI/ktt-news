const { MongoClient } = require('mongodb');

// ============================================
// CENTRINSIC NPT - SIMPLE QUEUE FIX
// Run: node fix-queue.js
// ============================================

const MONGODB_URI = 'mongodb+srv://ktt-newsAI:dheeraj2007@kttcluster.swd4f5n.mongodb.net/ktt_news';

async function fixQueue() {
    console.log('🚀 Centrinsic NPT Queue Fix');
    console.log('============================');
    console.log('');

    if (MONGODB_URI.includes('YOUR_MONGODB_URI_HERE')) {
        console.error('❌ ERROR: Replace YOUR_MONGODB_URI_HERE with your MongoDB URI');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db();
        const upcoming = db.collection('upcomingarticles');

        // Count current
        const count = await upcoming.countDocuments();
        console.log(`📊 Queued articles: ${count}`);
        console.log(`🎯 Target: 280 (35 × 8 days)`);
        console.log('');

        if (count === 0) {
            console.log('❌ No articles in queue');
            return;
        }

        // Get all articles
        const articles = await upcoming.find({}).toArray();
        console.log(`📦 Found ${articles.length} articles`);

        // Clear queue
        await upcoming.deleteMany({});
        console.log('🗑️  Cleared old queue');
        console.log('');

        // Redistribute - Day 1 = May 23, 2026
        const days = 8;
        const baseDate = new Date(2026, 4, 23);
        const perDay = Math.floor(articles.length / days);
        const extra = articles.length % days;

        let idx = 0;
        let total = 0;

        console.log('📅 Redistributing...');
        console.log('');

        for (let day = 0; day < days; day++) {
            const targetDate = new Date(baseDate);
            targetDate.setDate(targetDate.getDate() + day);
            targetDate.setHours(0, 0, 0, 0);

            const dayCount = day < extra ? perDay + 1 : perDay;
            const dayArticles = articles.slice(idx, idx + dayCount);
            idx += dayCount;

            for (const art of dayArticles) {
                const doc = {
                    title: art.title,
                    content: art.content,
                    summary: art.summary || art.content,
                    image: art.image,
                    source: art.source || 'RSS Auto-Fetch',
                    category: art.category || 'General',
                    originalLink: art.originalLink || '',
                    isManual: true,
                    status: 'published',
                    targetDate: targetDate,
                    dayLabel: `Day ${day + 1}`,
                    isRSS: art.isRSS || false,
                    author_name: art.author_name || 'RSS Auto-Fetch',
                    createdAt: art.createdAt || new Date(),
                    updatedAt: new Date()
                };
                await upcoming.insertOne(doc);
                total++;
            }

            const dateStr = targetDate.toDateString();
            const status = dayCount >= 35 ? '✅' : '⚠️';
            console.log(`   ${status} Day ${day + 1} (${dateStr}): ${dayCount} articles`);
        }

        console.log('');
        console.log('========================================');
        console.log('✅ DONE!');
        console.log(`   Total: ${total} articles`);
        console.log(`   Need ${280 - total} more for 35/day`);
        console.log('========================================');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.close();
        process.exit(0);
    }
}

fixQueue();