const { createClient } = require("@deepgram/sdk");
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);

module.exports = {
	deepgramClient
}