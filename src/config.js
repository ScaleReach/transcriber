let development = {
	invokeOrigin: "*"
}

let production = {
	invokeOrigin: "https://scalereach.team"
}

module.exports = process.env.NODE_ENV === "production" ? production : development