import axios from "axios"
import express from "express"
const router = express.Router()

import m2mMiddleware from "../middleware/m2m.js"
import redisClient from "../services/redis.js"

export default async ({ services, exceptions, logger, getSchema, env, respond, cache, getCacheKey }) => {

    const { ItemsService, MetaService } = services;
    const { ServiceUnavailableException } = exceptions;

    const schema = await getSchema()

    const playerService = new ItemsService('players', { schema: await getSchema() });
    const teamService = new ItemsService('teams', { schema: await getSchema() });
    const competitionService = new ItemsService('competitions', { schema: await getSchema() });
    const reportService = new ItemsService('reports', { schema: await getSchema() });
    const reportPlayerService = new ItemsService('reports_players', { schema: await getSchema() });
    const reportTeamService = new ItemsService('reports_teams', { schema: await getSchema() });
    const reportCompetitionService = new ItemsService('reports_competitions', { schema: await getSchema() });
    const voteService = new ItemsService('votes', { schema: await getSchema() });
    const userService = new ItemsService('directus_users', { schema: await getSchema() });
    const cardService = new ItemsService('sorare_cards', { schema: await getSchema() });

    const metaService = new MetaService({
        schema: await getSchema(),
        accountability: { admin: true }
    });


    // * REUSABLE LOGIC AMONG ENDPOINTS
    const getVotesForReport = async (report_id) => {

        let redisVotes = await redisClient.GET(`votes:report_${report_id}`)
        if (redisVotes) {
            console.log("votes from cache")
            return JSON.parse(redisVotes)
        }

        let filter = {
            collection: { _eq: "reports" },
            item: { _eq: report_id }
        }

        let data = await voteService.readByQuery({
            filter,
            fields: [
                "user.id",
                "user.nickname",
                "value"
            ],
            limit: -1
        }).then(res => res).catch(err => [])

        let meta = await metaService.getMetaForQuery("votes", {
            filter,
            meta: ["total_count", "filter_count"],
        });

        let votes = {
            value: data.reduce((prev, curr) => prev += curr.value, 0),
            votes: meta.filter_count,
            upvotes: data.filter(e => e.value == 1).map(e => e.user),
            downvotes: data.filter(e => e.value == -1).map(e => e.user)
        }

        await redisClient.SET(`votes:report_${report_id}`, JSON.stringify(votes))

        return votes
    }

    const postVoteForReport = async ({
        user,
        collection = "reports",
        item,
        value
    }) => {
        try {
            // * Check if vote exists
            let database_vote = await voteService.readByQuery({
                filter: {
                    user: { _eq: user },
                    collection: { _eq: collection },
                    item: { _eq: item }
                },
                limit: 1
            }).then(res => res[0]).catch(err => null)

            if (database_vote && database_vote.value == value) {
                // TODO Vote exists and didn't change : delete it
                await voteService.deleteOne(database_vote.id)
            }
            else {
                // * Upsert Vote
                let vote = {
                    user,
                    collection,
                    item,
                    value,
                    ...(database_vote && { id: database_vote.id })
                }
                let upserted_vote = await voteService.upsertOne(vote)
            }

            await redisClient.DEL(`votes:report_${item}`)
            let new_votes = await getVotesForReport(item)

            await reportService.updateOne(item, {
                score: new_votes.value
            })



            return new_votes

        }
        catch (err) {
            console.log(err.message)
        }

    }

    // * APPLY MIDDLEWARE FOR ALL ENDPOINTS
    // router.use(m2mMiddleware);

    // * GET FEED MATCHING THE FILTERS
    router.get('/', [
        async (req, res, next) => {
            try {
                let results = await axios({
                    url: `${env.PUBLIC_URL}/custom/feed/reports`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${env.CLUB_M2M_TOKEN}`
                    },
                    params: {
                        ...req.query,
                        filter: {
                            ...JSON.parse(req.query.filter || "{}"),
                            user: req.accountability.user
                        }
                    }
                }).then(res => res.data)


                for (let result of results.data) {
                    result.votes = await getVotesForReport(result.id)
                }



                // * Prepare the response
                res.locals.cache = false
                res.locals.payload = results
                return next()
            }
            catch (err) {
                return next(new ServiceUnavailableException(err.message));
            }
        },
        respond
    ]);

    // * GET REPORTS MATCHING THE FILTERS
    router.get('/reports', [
        m2mMiddleware,
        async (req, res, next) => {
            try {
                let { limit = 10, page = 1 } = req.query

                let {
                    user,
                    category,
                    players,
                    teams,
                    competitions,
                    sorare = false,
                    favorites,
                } = JSON.parse(req.query.filter || "{}")

                console.log({
                    user,
                    category,
                    players,
                    teams,
                    competitions,
                    sorare,
                    favorites,
                })

                let sorare_cards = []
                if (sorare) {
                    // * Get Sorare account for this user
                    let sorare_account = await userService.readOne(user, {
                        fields: [
                            "sorare_account"
                        ]
                    }).then(res => res.sorare_account).catch(err => null)

                    // * Get Sorare cards for this account
                    sorare_cards = sorare_account ? await cardService.readByQuery({
                        filter: {
                            sorare_account: { _eq: sorare_account }
                        },
                        fields: [
                            "player"
                        ],
                        limit: -1
                    }).then(res => res.map(e => e.player)) : []

                }

                let filter = {
                    score: { _gte: -5 },
                    ...(category && { category: { _eq: category } }),
                    ...(players && {
                        players: {
                            player: {
                                slug: { _in: players.split(',') },
                            },
                        },
                    }),
                    ...(sorare && {
                        players: {
                            player: {
                                id: { _in: sorare_cards },
                            },
                        },
                    }),
                    ...(teams && {
                        teams: {
                            team: {
                                slug: { _in: teams.split(',') },
                            },
                        },
                    }),
                    ...(competitions && {
                        competitions: {
                            competition: {
                                slug: { _in: competitions.split(',') },
                            },
                        },
                    }),
                }

                let fields = [
                    "*",
                    "author.nickname",
                    "author.avatar",
                    "players.player.id",
                    "players.player.slug",
                    "players.player.name",
                    "players.player.picture",
                    "teams.team.id",
                    "teams.team.slug",
                    "teams.team.name",
                    "teams.team.picture",
                    "competitions.competition.id",
                    "competitions.competition.slug",
                    "competitions.competition.name",
                    "competitions.competition.picture",
                ]

                let sort = ["-date_created"]

                let results = await reportService.readByQuery({
                    filter,
                    fields,
                    sort,
                    page: parseInt(page),
                    limit: parseInt(limit)
                })

                for (let i in results) {
                    results[i].players = results[i].players.map(e => e.player)
                    results[i].teams = results[i].teams.map(e => e.team)
                    results[i].competitions = results[i].competitions.map(e => e.competition)
                    if (results[i].author.avatar) results[i].author.avatar = `${env.PUBLIC_URL}/assets/${results[i].author.avatar}?width=100&height=100&quality=80&fit=contain`
                    // results[i].votes = await getVotesForReport(results[i].id)
                }

                let meta = await metaService.getMetaForQuery("reports", {
                    filter,
                    meta: ["total_count", "filter_count"],
                });

                // * Prepare the response
                res.locals.cache = true
                res.locals.payload = {
                    meta: {
                        ...meta,
                        page: parseInt(page),
                        limit
                    },
                    data: results
                }
                return next()
            }
            catch (err) {
                return next(new ServiceUnavailableException(err.message));
            }
        },
        respond
    ]);

    // * POST A NEW REPORT
    router.post('/', [
        async (req, res, next) => {
            try {

                // * PREPRARE REPORT DATA
                let author = req.accountability.user
                let {
                    title = "Report title",
                    description = "Report description",
                    url = "Report URL",
                    category = "other",
                    players = [],
                    teams = []
                } = req.body

                let report = {
                    author,
                    title,
                    category: category || 'other',
                    url,
                }

                // TODO CHECK IF SAME URL WAS ALREADY POSTED
                let same_report = await reportService.readByQuery({
                    filter: {
                        url: { _eq: url }
                    }
                }).then(res => res.length > 0).catch(err => false)

                // if (same_report) return res.status(208).send()

                // * CREATE REPORT
                let report_id = await reportService.createOne(report)

                // * ATTACH PLAYERS AND TEAMS TO THE REPORT
                if (players.length > 0) {
                    for (let player of players) {
                        let player_db = await playerService.readByQuery({
                            filter: {
                                slug: { _eq: player.slug },
                                name_lowercase: { _nnull: true }
                            },
                            fields: [
                                "id",
                                "teams.team.id",
                                "teams.team.slug",
                            ],
                            deep: {
                                teams: {
                                    _filter: {
                                        team: { type: { _neq: "NationalTeam" } }
                                    }
                                }
                            }
                        }).then(res => res[0]).catch(err => null)

                        if (player_db) {
                            await reportPlayerService.createOne({
                                report: report_id,
                                player: player_db.id
                            })

                            for (let team of player_db.teams) {
                                let index = teams.findIndex(e => e.slug == team.team.slug)
                                if (index == -1) teams.push(team.team)
                            }
                        }
                    }
                }
                if (teams.length > 0) {
                    await reportTeamService.createMany(teams.map(e => ({
                        report: report_id,
                        team: e.id
                    })))
                }

                await cache.clear()

                // * Prepare the response
                res.locals.cache = false
                res.locals.payload = true
                return next()
            }
            catch (err) {
                return next(new ServiceUnavailableException(err.message));
            }
        },
        respond
    ]);

    // * TOPS ENDPOINTS
    router.get('/tops/votes', [
        m2mMiddleware,
        async (req, res, next) => {
            try {

                let date = new Date()
                date.setDate(date.getDate() - 7);

                let results = await reportService.readByQuery({
                    filter: {
                        date_created: { _gte: date.toISOString() }
                    },
                    fields: [
                        "id",
                        "title",
                        "score",
                        "category",
                        "url",
                        "players.player.id",
                        "players.player.slug",
                        "players.player.name",
                        "players.player.picture",
                        "teams.team.id",
                        "teams.team.slug",
                        "teams.team.name",
                        "teams.team.picture",
                        "competitions.competition.id",
                        "competitions.competition.slug",
                        "competitions.competition.name",
                        "competitions.competition.picture",
                    ],
                    sort: ["-score"],
                    limit: 5
                })

                for (let i in results) {
                    results[i].players = results[i].players.map(e => e.player)
                    results[i].teams = results[i].teams.map(e => e.team)
                    results[i].competitions = results[i].competitions.map(e => e.competition)
                }


                res.locals.cache = false
                res.locals.payload = { data: results }
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);
    router.get('/tops/comments', [
        async (req, res, next) => {
            try {

            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);
    router.get('/tops/users', [
        async (req, res, next) => {
            try {

            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);

    // * VOTES ENDPOINTS
    router.post('/:report_id/upvote', [
        async (req, res, next) => {
            try {
                let user = req.accountability.user
                let collection = "reports"
                let { report_id: item } = req.params
                let value = 1

                res.locals.cache = false
                res.locals.payload = await postVoteForReport({
                    user,
                    collection,
                    item,
                    value
                })
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);
    router.post('/:report_id/downvote', [
        async (req, res, next) => {
            try {
                let user = req.accountability.user
                let collection = "reports"
                let { report_id: item } = req.params
                let value = -1

                res.locals.cache = false
                res.locals.payload = await postVoteForReport({
                    user,
                    collection,
                    item,
                    value
                })
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);

    // * COMMENTS ENDPOINTS
    router.post('/:report_id/comments', [
        async (req, res, next) => {
            try {
                return res.status(401).send()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);
    router.get('/:report_id/comments', [
        async (req, res, next) => {
            try {
                return res.status(401).send()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);
    router.patch('/:report_id/comments/:comment_id', [
        async (req, res, next) => {
            try {
                return res.status(401).send()
            }
            catch (err) {
                console.log(err.message)
                return res.json(null)
            }
        },
        respond
    ]);

    return router
}