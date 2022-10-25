import axios from "axios"
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
    const sorareAccountService = new ItemsService('sorare_accounts', { schema });
    const directusUserService = new ItemsService('directus_users', { schema });

    const metaService = new MetaService({
        schema: await getSchema(),
        accountability: { admin: true }
    });

    // * REUSABLE LOGIC AMONG ENDPOINTS

    // * APPLY MIDDLEWARE FOR ALL ENDPOINTS
    // router.use(m2mMiddleware);

    // * ENDPOINTS
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

    router.get('/me', [
        async (req, res, next) => {
            try {
                let user_id = req.accountability.user

                let user = await directusUserService.readOne(user_id, {
                    fields: [
                        "id",
                        "email",
                        "nickname",
                        "avatar",
                        "sorare_account.id",
                        "sorare_account.slug",
                        "sorare_account.nickname",
                        "sorare_account.picture",
                        "sorare_account.club_name",
                        "sorare_account.club_picture",
                    ]
                })

                console.log(user)

                res.locals.cache = false
                res.locals.payload = user
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);

    router.post('/me/sorare', [
        async (req, res, next) => {
            try {
                let manager = req.accountability.user
                let { code } = req.body

                console.log({
                    manager,
                    code
                })

                // * GET CURRENT USER FROM TOKEN
                let profile = await axios({
                    url: `${env.SORARE_WORKER_URL}/managers/current`,
                    method: 'GET',
                    headers: {
                        token: env.SORARE_WORKER_TOKEN
                    },
                    params: {
                        code
                    }
                }).then(res => res.data).then(res => ({
                    id: res.id.split(":")[1],
                    slug: res.slug,
                    nickname: res.nickname,
                    picture: res.profile?.pictureUrl,
                    club_name: res.profile?.clubName,
                    club_picture: res.profile?.clubShield?.pictureUrl
                })).catch(err => {
                    console.log(err)
                    return null
                })

                if (!profile) return res.status(400).json("Can't get profile")

                // * CHECK IF THIS ACCOUNT IS ALREADY IN USE
                let account_in_use = await directusUserService.readByQuery({
                    filter: {
                        sorare_account: {
                            _eq: profile.id
                        }
                    },
                    fields: [
                        "id"
                    ]
                }).then(res => (res && res.length > 0 && res[0].id != manager) ? true : false)

                if (account_in_use) return res.status(400).json("This account is already linked to an other user")

                // * IF THERE IS A LINKED ACCOUNT, CANCEL
                let sorare_already_linked = await directusUserService.readOne(manager, {
                    fields: [
                        "sorare_account"
                    ]
                }).then(res => res.sorare_account ? true : false)

                if (sorare_already_linked) return res.status(400).json("Sorare account already linked")

                // * UPSERT SORARE ACCOUNT
                let account = await sorareAccountService.upsertOne(profile)

                // * UPDATE SORARE ACOUNT FOR DIRECTUS USER
                await directusUserService.updateOne(manager, {
                    sorare_account: profile.id
                })

                // * GET UPDATED PROFILE
                let updated_profile = await directusUserService.readOne(manager, {
                    fields: [
                        "id",
                        "email",
                        "nickname",
                        "avatar",
                        "sorare_account.id",
                        "sorare_account.slug",
                        "sorare_account.nickname",
                        "sorare_account.picture",
                        "sorare_account.club_name",
                        "sorare_account.club_picture",
                    ]
                })

                // * RETURN RESULTS
                res.locals.cache = false
                res.locals.payload = updated_profile
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);
    router.delete('/me/sorare', [
        async (req, res, next) => {
            try {
                let manager = req.accountability.user

                // * UPDATE SORARE ACOUNT FOR DIRECTUS USER
                await directusUserService.updateOne(manager, {
                    sorare_account: null
                })

                // * GET UPDATED PROFILE
                let profile = await directusUserService.readOne(manager, {
                    fields: [
                        "id",
                        "email",
                        "nickname",
                        "avatar",
                        "sorare_account.id",
                        "sorare_account.slug",
                        "sorare_account.nickname",
                        "sorare_account.picture",
                        "sorare_account.club_name",
                        "sorare_account.club_picture",
                    ]
                })

                // * RETURN RESULTS
                res.locals.cache = false
                res.locals.payload = profile
                return next()
            }
            catch (err) {
                console.log(err.message)
                return res.status(500).send()
            }
        },
        respond
    ]);

    router.patch('/me/sorare/cards', [
        async (req, res, next) => {
            try {
                let manager = req.accountability.user
                let {
                    positions = null,
                    rarities = null,
                    force = false,
                } = req.query

                let sorare_id = await directusUserService.readOne(manager, {
                    fields: [
                        "sorare_account"
                    ]
                }).then(res => res.sorare_account)


                let cards = await axios({
                    url: `${env.SORARE_WORKER_URL}/managers/${sorare_id}/cards`,
                    method: 'PATCH',
                    headers: {
                        token: env.SORARE_WORKER_TOKEN
                    },
                    params: {
                        positions,
                        rarities,
                        force
                    }
                }).then(res => res.data)

                res.locals.cache = false
                res.locals.payload = cards
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