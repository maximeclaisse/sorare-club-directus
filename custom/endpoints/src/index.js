import redisClient from "./services/redis.js";

import authenticated from "./middleware/authenticated.js"

import feed from "./routes/feed.js"
import players from "./routes/players.js"
import users from "./routes/users.js"
import utils from "./routes/utils.js"

export default async (router, context) => {

	// * EXTEND CONTEXT WITH CACHE STUFF
	context = {
		...context,
		// asyncHandler: require("directus/utils/async-handler").default,
		respond: require("directus/middleware/respond").respond,
		getCacheKey: require("directus/utils/get-cache-key").getCacheKey,
		cache: require("directus/cache").getCache().cache
	}

	// * INIT GLOBAL REDIS
	await redisClient.connect()

	// * LOAD GLOBAL MIDDLEWARE
	router.use(authenticated)

	// * LOAD CUSTOM ROUTES
	let feedRoutes = await feed(context)
	let playersRoutes = await players(context)
	let usersRoutes = await users(context)
	let utilsRoutes = await utils(context)

	router.use("/feed", feedRoutes)
	router.use("/players", playersRoutes)
	router.use("/users", usersRoutes)
	router.use("/utils", utilsRoutes)

}