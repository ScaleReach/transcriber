const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");
const cors = require("cors");
const bodyParser = require('body-parser')
const config = require("./config")
const header = require("./header")
const dotenv = require("dotenv");
const { Readable } = require("node:stream")
const { Console } = require("console");
dotenv.config({path: __dirname +"/.env"});

const { recognitionModel } = require("./recognition")
const { synthesisModel } = require("./synthesis")

console.log("SSL_KEY", process.env.SSL_KEY)
const app = express();
let server;
if (process.env.NODE_ENV == "production") {
	const options = {
		key: fs.readFileSync(process.env.SSL_KEY),
		cert: fs.readFileSync(process.env.SSL_CERT),
	}

	server = https.createServer(options, app);
} else {
	server = http.createServer(app)
}
const io = socketIO(server, {
	cors: {
		origin: config.invokeOrigin,
		methods: ["GET", "POST"],
		credentials: true
	}
});


const recognitionNsp = io.of("recognition")
recognitionNsp.on("connection", (socket) => {
	const origin = socket.handshake.headers.origin
	console.log("socket: client connected", origin, config.invokeOrigin);
	if (config.invokeOrigin !== "*" && origin != config.invokeOrigin) {
		// not allowed --> disconnect client immediately
		socket.disconnect(true)
		return
	}

	let deepgram;
	let globalPrefs = {
		lang: 0
	}

	const resetRecognitionInstance = () => {
		deepgram.finish()
		deepgram.removeAllListeners()
		deepgram = null
	}

	socket.on("set-prefs", (prefs) => {
		globalPrefs = prefs
	})

	socket.on("preload", (message) => {
		console.log("preload event")
		if (deepgram && deepgram.getReadyState() === 1) {
			console.log("already active")
			socket.emit("preload-ready")
			return // already connected
		}
		console.log("passed")

		let resolverFn;
		const promise = new Promise(res => {
			resolverFn = res
			console.log(resolverFn)
			deepgram = recognitionModel(socket, globalPrefs.lang, resetRecognitionInstance, resolverFn);
		}).then(() => {
			console.log("emiting preload-ready")
			socket.emit("preload-ready")
		})

	})

	let previousAudio = new ArrayBuffer(0)
	const appendAudio = (audioBuffer) => {
		let oldView = new Uint8Array(previousAudio)
		let newView = new Uint8Array(audioBuffer)

		let combinedBuffer = new ArrayBuffer(oldView.length +newView.length)
		let combinedView = new Uint8Array(combinedBuffer)

		combinedView.set(oldView, 0)
		combinedView.set(newView, oldView.length)

		previousAudio = combinedBuffer
		return previousAudio;
	}
	socket.on("audio", (message, id) => {
		console.log("socket: client data received", id);
		if (deepgram == null) {
			deepgram = recognitionModel(socket, globalPrefs.lang, resetRecognitionInstance)
		}

		if (deepgram.getReadyState() === 1 /* OPEN */) {
			deepgram.send(new Blob([message]))
			// if (previousAudio.byteLength >= 1) {
			// 	deepgram.send(new Blob([appendAudio(message.buffer.slice(message.byteOffset, message.byteOffset +message.byteLength))]));
			// 	previousAudio = new ArrayBuffer(0)
			// } else {
			// 	console.log("socket: data sent to deepgram", id);
			// }
		} else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
			console.log("socket: retrying connection to deepgram");
			deepgram.finish();
			deepgram.removeAllListeners();
			
			appendAudio(message.buffer.slice(message.byteOffset, message.byteOffset +message.byteLength)) // store chunk for use later
			deepgram = recognitionModel(socket, globalPrefs.lang, resetRecognitionInstance)
		} else {
			appendAudio(message.buffer.slice(message.byteOffset, message.byteOffset +message.byteLength)) // store chunk for use later
			console.log("socket: data couldn't be sent to deepgram");
		}
	});

	socket.on("disconnect", () => {
		console.log("socket: client disconnected");
		if (deepgram) {
			deepgram.finish();
			deepgram.removeAllListeners();
			deepgram = null;
		}
	});

	setTimeout(() => {
		if (socket) {
			socket.disconnect()
		}
	}, 360000) // 6minutes timeout
});


app.use((req, res, next) => {
	if (config.invokeOrigin !== "*" && req.headers.origin === config.invokeOrigin) {
		return res.status(400).end() // not allowed
	}

	next();
})
app.use(cors({
	origin: config.invokeOrigin,
	methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
	credentials: true
}));
app.use(bodyParser.json())
app.use(express.static("public/"));
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/public/index.html");
});

app.post("/synthesis", async (req, res) => {
	console.log(req.body, req.body.text)
	const stream = await synthesisModel(req.body.text, req.body.speaker)

	if (stream) {
		res.set({
			"Content-Type": "application/octet-stream"
		})

		const readable = new Readable.fromWeb(stream)
		return readable.pipe(res)
	} else {
		return res.status(500).end()
	}
})

server.listen(process.env.PORT, () => {
	console.log(header("Transcriber", process.env.PORT))
});
