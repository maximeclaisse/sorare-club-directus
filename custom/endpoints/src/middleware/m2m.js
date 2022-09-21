// * CHECKS IF THE REQUEST IS MADE BY AN AUTHORIZED M2M TOKEN
export default (req, res, next) => {
    if (req.accountability.role != "0af2266f-d023-4958-8409-2364026a62aa") return res.status(401).send()
    else next()
}