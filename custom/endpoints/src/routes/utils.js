import axios from "axios"
import express from "express"
const router = express.Router()

import m2mMiddleware from "../middleware/m2m.js"

export default async ({ services, exceptions, logger, getSchema, env, respond }) => {

    const { ItemsService, MetaService } = services;
    const { ServiceUnavailableException } = exceptions;

    const schema = await getSchema()

    const newsService = new ItemsService('news', { schema });

    const metaService = new MetaService({
        schema: await getSchema(),
        accountability: { admin: true }
    });

    // * REUSABLE LOGIC AMONG ENDPOINTS

    // * APPLY MIDDLEWARE FOR ALL ENDPOINTS
    router.use(m2mMiddleware);

    // * MIGRATIONS
    router.get('/migrations/news', [
        async (req, res, next) => {
            try {
                // * Get old news
                const newsService = new ItemsService('news', { schema: await getSchema() });
                var oneWeek = new Date();
                oneWeek.setDate(oneWeek.getDate() - 7);
                let old_news = await newsService.readByQuery({
                    filter: {
                        date_created: { _gte: oneWeek.toISOString() },
                    },
                    fields: [
                        "title",
                        // "author",
                        "category",
                        "url",
                        "players.players_id.slug",
                        "leagues.leagues_id.slug",
                        "clubs.clubs_id.slug"
                    ],
                    sort: ["date_created"],
                    limit: 10
                }).then(res => res.map(e => ({
                    ...e,
                    players: e.players.map(p => p.players_id.slug),
                    clubs: e.clubs.map(p => p.clubs_id.slug),
                    leagues: e.leagues.map(p => p.leagues_id.slug)
                })))

                let reports = []
                for (let i in old_news) {
                    delete Object.assign(old_news[i], { teams: old_news[i].clubs }).clubs;
                    delete Object.assign(old_news[i], { competitions: old_news[i].leagues }).leagues;
                    reports.push(await axios({
                        url: `${env.PUBLIC_URL}/feed`,
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${env.CLUB_M2M_TOKEN}`
                        },
                        data: old_news[i]
                    }).then(res => res.data))
                }


                res.locals.cache = false
                res.locals.payload = {
                    count: reports.length,
                    data: reports
                }
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);
    router.get('/migrations/votes', [
        async (req, res, next) => {
            try {
                // TODO
                res.locals.cache = false
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

    // * GET TWITTER PREVIEW
    router.get('/twitter', [
        async (req, res, next) => {
            try {
                let { url } = JSON.parse(req.query.filter || "{}")

                let result = await axios({
                    url: `https://publish.twitter.com/oembed`,
                    method: 'GET',
                    params: {
                        url: url,
                        hide_media: true,
                        hide_thread: true,
                    }
                }).then(res => res.data).catch(err => null)


                res.locals.cache = true
                res.locals.payload = result
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);

    // * AN ENDPOINT TO UPSERT DATA IN ANY COLLECTION
    router.post('/data/upsert', [
        async (req, res, next) => {
            try {
                let { collection, items } = req.body

                let service = new ItemsService(collection, { schema });
                let upserted = await service.upsertMany(items)
                res.locals.cache = false
                res.locals.payload = upserted
                next()
            }
            catch (err) {
                return next(new ServiceUnavailableException(err.message));
            }
        },
        respond
    ]);

    return router
}