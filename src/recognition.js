const { LiveTranscriptionEvents } = require("@deepgram/sdk");
const { deepgramClient } = require("./deepgramClient");

const recognitionModel = (socket, lang, closeFn, res) => {
	const deepgram = deepgramClient.listen.live({
		language: ["en-US", "zh-CN", "ms", "ta", "hi"][lang],
		punctuate: true,
		smart_format: true,
		model: lang === 3 ? "enhanced" : "nova-2", // only enhanced has support for tamil

		filler_words: true,

		endpointing: 500,
		interim_results: true,
		utterance_end_ms: 1000,
		vad_events: true
	});

	deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
		if (res) {
			// resolve promise on open
			res()
		}
		console.log("deepgram: connected!!", res);

		let finalTranscripts = []
		let timestamp = +new Date()
		deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
			console.log("deepgram: transcript received\n\t", data.type, data.speech_final, data.is_final, data.channel.alternatives[0].transcript);


			const sent = data.channel.alternatives[0].transcript
			if (sent.length === 0) {
				// if (data.speech_final) {
				// 	// failed
				// 	socket.emit("transcription-failure")
				// 	closeFn() // close deepgram connection (reset it when user re-initiates mic input)
				// }
				if (data.speech_final && data.is_final) {
					if (finalTranscripts.length === 0) {
						socket.emit("transcription-failure")
						return deepgram.finalize()
					} else {
						// has transcripts
						const utterance = finalTranscripts.join(" ")
						finalTranscripts = [] // reset

						socket.emit("transcription", {
							type: "end",
							content: utterance,
							duration: data.duration
						})

						closeFn() // call close function
					}
				}
				return
			}

			if (data.is_final) {
				timestamp = +new Date()
				finalTranscripts.push(sent)

				const utterance = finalTranscripts.join(" ")
				if (data.speech_final) {
					finalTranscripts = [] // reset

					socket.emit("transcription", {
						type: "end",
						content: utterance,
						duration: data.duration
					})

					closeFn() // call close function
				} else {
					// interim results (finalised)
					socket.emit("transcription", {
						type: "interim",
						content: utterance,
						duration: data.duration
					})
				}
			} else if (data.channel.alternatives[0].transcript.length === 0) {
				// empty
				const now = +new Date()
				console.log("hmmm", now-timestamp, finalTranscripts.length)
				if (now -timestamp >= 2000 && finalTranscripts.length >= 1) {
					// 2 seconds since last transcript
					const utterance = finalTranscripts.join(" ")
					finalTranscripts = [] // reset

					socket.emit("transcription", {
						type: "end",
						content: utterance,
						duration: data.duration
					})

					closeFn() // call close function
				} else if (now -timestamp >= 5000) {
					// no audio??
					socket.emit("transcription-failure")
					socket.disconnect()

					closeFn()
				}
			} else {
				// interim results
				console.log("interim!!")
				socket.emit("transcription", {
					type: "interim",
					content: data.channel.alternatives[0].transcript,
					duration: data.duration
				})
			}
		});

		deepgram.addListener(LiveTranscriptionEvents.SpeechStarted, data => {
			console.log("\n\nINCOMING SpeechStarted", data)
		})

		deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
			console.log("deepgram: disconnected");
			deepgram.finalize();
		});

		deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
			console.log("deepgram: error received");
			console.error(error);
		});

		deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
			console.log("deepgram: warning received");
			console.warn(warning);
		});

		deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
			console.log("deepgram: packet received", metadata);
			console.log("deepgram: metadata received");
			console.log("ws: metadata sent to client");
		});
	});

	return deepgram;
};

module.exports = {
	recognitionModel
}