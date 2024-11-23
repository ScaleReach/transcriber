const { deepgramClient } = require("./deepgramClient");

const synthesisModel = async (text, speaker) => {
	// STEP 1: Make a request and configure the request with options (such as model choice, audio configuration, etc.)
	if (text.length >= 1000) {
		// prevent API abuse
		return
	}

	const response = await deepgramClient.speak.request(
		{ text },
		{
			model: speaker === 0 ? "aura-asteria-en" : "aura-helios-en",
			encoding: "aac"
		}
	);

	// STEP 2: Get the audio stream and headers from the response
	const stream = await response.getStream();
	const headers = await response.getHeaders();
	if (stream) {
		// STEP 3: Convert the stream to an audio buffer
		console.log("STREAM", stream)
		return stream
	} else {
		console.error("Error generating audio:", stream);
	}

	if (headers) {
		console.log("Headers:", headers);
	}
};

module.exports = {
	synthesisModel
}