// * JUST CHECKS IF THE REQUEST IS AUTHENTICATED
export default (req, res, next) => {
    if (!req.accountability.user) return res.status(402).send()
    else next()
}