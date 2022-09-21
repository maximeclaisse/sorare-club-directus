import axios from "axios"
import express from "express"
const router = express.Router()

import m2mMiddleware from "../middleware/m2m.js"

export default async ({ services, exceptions, logger, getSchema, env, respond }) => {

    const { ItemsService, MetaService } = services;
    const { ServiceUnavailableException } = exceptions;

    const schema = await getSchema()

    const playerService = new ItemsService('players', { schema });

    const metaService = new MetaService({
        schema: await getSchema(),
        accountability: { admin: true }
    });

    // * REUSABLE LOGIC AMONG ENDPOINTS

    // * APPLY MIDDLEWARE FOR ALL ENDPOINTS
    // router.use(m2mMiddleware);

    // * GET PLAYERS MATCHING THE FILTERS
    router.get('/', [
        m2mMiddleware,
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
    // * GET DNP PLAYERS MATCHING THE FILTERS
    router.get('/dnp', [
        async (req, res, next) => {
            try {
                let { limit, page } = req.query
                let { competition, team, player, status, u23, sorare, favorites } = JSON.parse(req.query.filter || "{}")

                // * ALL REQUESTS THAT ARE MADE WITH A REGULAR USER TOKEN ARE REDIRECTED TO M2M REQUESTS TO LEVERAGE CACHE
                if (req.accountability.user != '451426f5-9f2c-4163-8160-c6c711706e27') {
                    res.locals.payload = await axios({
                        url: `${env.PUBLIC_URL}/custom/players/dnp`,
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${env.CLUB_M2M_TOKEN}`
                        },
                        params: {
                            ...req.query,
                            filter: {
                                ...JSON.parse(req.query.filter || "{}"),
                                // user: req.accountability.user
                            }
                        }
                    }).then(res => res.data)
                    return next()
                }



                var oneweek = new Date();
                oneweek.setDate(oneweek.getDate() - 7);


                let query = {
                    filter: {
                        ...(status ? { dnp_status: { _in: status } } : {
                            _or: [
                                {
                                    dnp_status: {
                                        _neq: "ok"
                                    }
                                },
                                {
                                    _and: [
                                        {
                                            dnp_status: {
                                                _eq: "back"
                                            },
                                            dnp_date_updated: {
                                                _gte: oneweek.toISOString()
                                            }
                                        },
                                    ]
                                }
                            ]
                        }),
                        // ...(user_id && favorites && { slug: { _in: favoriteCards } }),
                        // ...(user_id && gallery && { slug: { _in: galleryCards } }),
                        ...(player && {
                            slug: { _eq: player },
                        }),
                        ...(team && {
                            teams: { team: { slug: { _eq: team } } },
                        }),
                        ...(competition && {
                            competitions: { competition: { _eq: competition } },
                        }),
                        ...(u23 && {
                            _and: [
                                {
                                    birth_date_i: { _nnull: true }
                                },
                                {
                                    birth_date_i: { _gte: 867747422 }
                                }
                            ]
                        })
                    },
                    fields: ['*', "dnp_author.nickname", "dnp_author.pictureUrl", "dnp_author.slug", 'club.*', 'league.*'],
                    meta: ["total_count", "filter_count"],
                    sort: ["-dnp_date_updated", "league", "club", "name", "-dnp_date_updated"],
                    limit: (parseInt(limit) || 20),
                    offset: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20),
                }

                res.locals.cache = false
                res.locals.payload = {
                    data: await playerService.readByQuery(query),
                    meta: await metaService.getMetaForQuery('players', query)
                }
                return next()
            }
            catch (err) {
                return next(new ServiceUnavailableException(err.message));
            }
        },
        respond
    ]);
    // * GET DNP PLAYERS MATCHING THE FILTERS
    router.get('/:player_id', [
        async (req, res, next) => {
            try {








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

    return router
}