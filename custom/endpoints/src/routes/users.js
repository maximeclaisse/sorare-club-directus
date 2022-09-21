import express from "express"
const router = express.Router()

// import m2mMiddleware from "../middleware/m2m.js"

export default async ({ services, exceptions, logger, getSchema, env, respond }) => {

    const { ItemsService, MetaService } = services;

    const schema = await getSchema()

    const articleService = new ItemsService('articles', { schema });
    const commentService = new ItemsService('comments', { schema });
    const playerService = new ItemsService('players', { schema });
    const teamService = new ItemsService('teams', { schema });
    const competitionService = new ItemsService('competitions', { schema });

    const metaService = new MetaService({
        schema: await getSchema(),
        accountability: { admin: true }
    });

    // * REUSABLE LOGIC AMONG ENDPOINTS

    // * APPLY MIDDLEWARE FOR ALL ENDPOINTS
    // router.use(m2mMiddleware);

    // * GET ARTICLES MATCHING THE FILTERS
    router.get('/', [
        async (req, res, next) => {
            try {
                res.locals.cache = true
                res.locals.payload = null
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);

    return router
}